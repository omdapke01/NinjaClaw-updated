// Task-Aware Dynamic Exemplar Matching

export function matchRelevantExemplars(exemplars = [], { userMessage = "", activeFilePath = "", intent = "" } = {}) {
  if (!exemplars || exemplars.length === 0) return [];

  const text = `${userMessage} ${activeFilePath} ${intent}`.toLowerCase();

  // Categorize user intent
  let preferredCategory = "service_method";

  if (/(error|exception|fail|statuscode|try|catch|throw|reject|badrequest|notfound|unauthorized|apperror)/.test(text)) {
    preferredCategory = "error_handler";
  } else if (/(class|constructor|inject|service|repository|di|instantiate|schema|factory|controller)/.test(text)) {
    preferredCategory = "class_di";
  } else if (/(validate|guard|check|param|early return|function|method|endpoint|route|feature|calculate|handle)/.test(text)) {
    preferredCategory = "service_method";
  }

  // Sort exemplars placing preferred category first
  const sorted = [...exemplars].sort((a, b) => {
    if (a.category === preferredCategory && b.category !== preferredCategory) return -1;
    if (b.category === preferredCategory && a.category !== preferredCategory) return 1;
    return 0;
  });

  // Return top 1 or 2 exemplars (keep prompt token count tight)
  return sorted.slice(0, 2);
}

export function formatExemplarsForPrompt(matchedExemplars = []) {
  if (matchedExemplars.length === 0) return "";

  const sections = matchedExemplars.map((ex, index) => {
    const roleLabel =
      ex.category === "service_method"
        ? "Exemplary Service Method (Guard clauses, validation, and error flow)"
        : ex.category === "class_di"
        ? "Exemplary Class Architecture (Constructor dependency injection and structure)"
        : "Exemplary Error Handling Pattern (Exception wrapping and return contracts)";

    return [
      `[Exemplar #${index + 1}: ${roleLabel}]`,
      `// Symbol: ${ex.symbolPath} (${ex.filePath})`,
      ex.code.trim()
    ].join("\n");
  });

  return [
    "",
    "=== GOLDEN CODE EXEMPLARS (Reference implementations from THIS repository) ===",
    "INSTRUCTION: You must strictly adhere to the OOP paradigms, guard-clause styles, and error-handling patterns demonstrated below:",
    "",
    sections.join("\n\n")
  ].join("\n");
}
