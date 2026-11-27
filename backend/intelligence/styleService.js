import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { astWorkerPool } from "./astWorkerPool.js";
import { sniffConfigFiles } from "./configSniffer.js";
import { sampleStratifiedFiles } from "./fileSampler.js";
import { extractStyleProfile } from "./styleExtractor.js";
import { dependencyGraph } from "./dependencyGraph.js";

function sha256(content = "") {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export class StyleService {
  constructor({ projectsCollection, filesCollection, io, tempRootDir, geminiApiKey, geminiModel }) {
    this.projectsCollection = projectsCollection;
    this.filesCollection = filesCollection;
    this.io = io;
    this.tempRootDir = tempRootDir;
    this.geminiApiKey = geminiApiKey;
    this.geminiModel = geminiModel;
    // In-memory cache of AST nodes per project: projectId -> Map(filePath -> astResult)
    this.projectAstCache = new Map();
  }

  async getStyleProfile(projectId, ownerId) {
    const project = await this.projectsCollection.findOne(
      { id: projectId, ownerId },
      { projection: { _id: 0, styleProfile: 1, name: 1 } }
    );
    if (!project) return null;

    const baseProfile = project.styleProfile || {
      status: "idle",
      updatedAt: null,
      conventions: {},
      exemplars: [],
      userOverrides: {}
    };

    // Apply userOverrides on top of conventions for consumption
    const effectiveConventions = {
      ...(baseProfile.conventions || {}),
      ...(baseProfile.userOverrides || {})
    };

    return {
      ...baseProfile,
      effectiveConventions
    };
  }

  async updateOverrides(projectId, ownerId, overrides = {}) {
    const now = new Date().toISOString();
    await this.projectsCollection.updateOne(
      { id: projectId, ownerId },
      {
        $set: {
          "styleProfile.userOverrides": overrides,
          "styleProfile.updatedAt": now
        }
      }
    );

    // Sync to workspace .ninjaclaw/style-profile.json
    await this.exportStyleProfileFile(projectId, ownerId);

    if (this.io) {
      this.io.to(ownerId).emit("style:updated", {
        projectId,
        event: "STYLE_OVERRIDES_SAVED",
        status: "ready"
      });
    }

    return this.getStyleProfile(projectId, ownerId);
  }

  async indexProjectStyle(projectId, ownerId, forceReindex = false) {
    const project = await this.projectsCollection.findOne({ id: projectId, ownerId });
    if (!project) throw new Error("Project not found");

    // Fetch all project files from MongoDB
    const files = await this.filesCollection.find({ projectId, ownerId }, { projection: { _id: 0, path: 1, content: 1, language: 1 } }).toArray();

    // 1. Calculate incremental hashes
    const currentHashes = {};
    const changedFiles = [];
    const previousHashes = project.styleProfile?.fileHashes || {};

    let projectCache = this.projectAstCache.get(projectId);
    if (!projectCache) {
      projectCache = new Map();
      this.projectAstCache.set(projectId, projectCache);
    }

    for (const f of files) {
      // Ignore binary or non-source directories
      if (f.path.includes("node_modules") || f.path.includes(".git/") || f.path.includes("dist/")) continue;
      const hash = sha256(f.content || "");
      currentHashes[f.path] = hash;

      if (forceReindex || previousHashes[f.path] !== hash || !projectCache.has(f.path)) {
        changedFiles.push(f);
      }
    }

    // If no files changed and already ready, avoid unnecessary LLM & AST calls
    if (!forceReindex && changedFiles.length === 0 && project.styleProfile?.status === "ready") {
      return project.styleProfile;
    }

    // Set status to indexing
    await this.projectsCollection.updateOne(
      { id: projectId, ownerId },
      { $set: { "styleProfile.status": "indexing", "styleProfile.updatedAt": new Date().toISOString() } }
    );

    if (this.io) {
      this.io.to(ownerId).emit("style:progress", {
        projectId,
        event: "STYLE_INDEX_START",
        status: "indexing",
        totalFiles: files.length,
        changedFiles: changedFiles.length
      });
    }

    try {
      // 2. Offload AST parsing of changed files to Worker Threads pool
      if (changedFiles.length > 0) {
        const parsedBatch = await astWorkerPool.parseFiles(changedFiles);
        for (let i = 0; i < changedFiles.length; i++) {
          projectCache.set(changedFiles[i].path, parsedBatch[i]);
        }
      }

      // Collect all AST parsed files for this project
      const allParsedFiles = Array.from(projectCache.values());
      const allNodes = allParsedFiles.flatMap((f) => f.nodes || []);

      // Synchronize Live Dependency Graph
      dependencyGraph.updateProjectFiles(allParsedFiles);

      // 3. Tier 1: Deterministic Config Sniffing (Zero LLM Tokens)
      const configFacts = sniffConfigFiles(files);

      // 4. Tier 2: Stratified Sampling (10-15 high-centrality files across layers)
      const sampledFiles = sampleStratifiedFiles(allParsedFiles);

      // 5. LLM Synthesis with Gemini responseSchema & Golden Exemplars
      const extracted = await extractStyleProfile({
        configFacts,
        sampledFiles,
        allNodes,
        apiKey: this.geminiApiKey,
        model: this.geminiModel
      });

      const userOverrides = project.styleProfile?.userOverrides || {};
      const now = new Date().toISOString();

      const updatedProfile = {
        status: "ready",
        lastIndexedCommit: null,
        updatedAt: now,
        fileHashes: currentHashes,
        conventions: extracted.conventions,
        exemplars: extracted.exemplars,
        userOverrides
      };

      // 6. MongoDB as Runtime Authority
      await this.projectsCollection.updateOne(
        { id: projectId, ownerId },
        { $set: { styleProfile: updatedProfile } }
      );

      // 7. Write .ninjaclaw/style-profile.json to MongoDB project files & disk
      await this.exportStyleProfileFile(projectId, ownerId, updatedProfile);

      // 8. WebSocket Event Broadcast
      if (this.io) {
        this.io.to(ownerId).emit("style:completed", {
          projectId,
          event: "STYLE_INDEX_COMPLETE",
          status: "ready",
          exemplarCount: extracted.exemplars.length
        });
      }

      return updatedProfile;
    } catch (err) {
      console.error(`[StyleService] Failed to index style for project ${projectId}:`, err);
      await this.projectsCollection.updateOne(
        { id: projectId, ownerId },
        { $set: { "styleProfile.status": "failed", "styleProfile.error": err.message } }
      );
      if (this.io) {
        this.io.to(ownerId).emit("style:failed", {
          projectId,
          event: "STYLE_INDEX_FAILED",
          status: "failed",
          error: err.message
        });
      }
      throw err;
    }
  }

  async exportStyleProfileFile(projectId, ownerId, profileData = null) {
    const profile = profileData || (await this.getStyleProfile(projectId, ownerId));
    if (!profile) return;

    const exportPayload = {
      $schema: "https://ninjaclaw.dev/schemas/style-profile.v1.json",
      generator: "NinjaClaw Codebase Style DNA Extractor",
      updatedAt: profile.updatedAt || new Date().toISOString(),
      conventions: profile.effectiveConventions || profile.conventions,
      exemplars: (profile.exemplars || []).map((e) => ({
        category: e.category,
        symbolPath: e.symbolPath,
        filePath: e.filePath
      }))
    };

    const filePath = ".ninjaclaw/style-profile.json";
    const content = JSON.stringify(exportPayload, null, 2);

    // Save into filesCollection
    await this.filesCollection.updateOne(
      { projectId, path: filePath },
      {
        $set: {
          ownerId,
          name: "style-profile.json",
          path: filePath,
          content,
          language: "json",
          updatedAt: new Date().toISOString()
        },
        $setOnInsert: {
          id: crypto.randomUUID(),
          projectId,
          createdAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }
}
