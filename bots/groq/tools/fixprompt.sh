#!/bin/bash
# usage: fixprompt.sh <specPrompt> <codeFile> <issuesFile> <outPrompt>
{ echo "You previously wrote the file below from this SPEC. Fix ALL listed issues and return the COMPLETE corrected file (one javascript code block, no explanation). Keep everything that already works; follow the SPEC.";
  echo; echo "=== ISSUES (from review and real test runs) ==="; cat "$3";
  echo; echo "=== SPEC ==="; cat "$1";
  echo; echo "=== CURRENT FILE ==="; echo '```javascript'; cat "$2"; echo '```'; } > "$4"
