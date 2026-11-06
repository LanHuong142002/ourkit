// The documents a change produces on its way through the Stages, and what each must contain.
const fs = require('fs');
const path = require('path');

const ARTIFACTS = {
  spec: { folder: 'specs', sections: ['Goal', 'Requirements', 'Acceptance Criteria', 'Out of Scope', 'Open Questions'] },
};

const relativePathFor = (name, id) =>
  path.join('.ourkit', ARTIFACTS[name].folder, `${id.replace(/[^A-Za-z0-9._-]/g, '-')}.md`);

// Returns what's wrong with an artifact, as a list of problems.
function checkArtifact(projectDir, name, id) {
  const relative = relativePathFor(name, id);
  const file = path.join(projectDir, relative);
  if (!fs.existsSync(file)) return [`${relative.replace(/\\/g, '/')} doesn't exist yet`];
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const problems = [];
  for (const section of ARTIFACTS[name].sections) {
    const match = text.match(new RegExp(`^## ${section}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
    if (!match) problems.push(`the "${section}" section is missing`);
    else if (!match[1].trim()) problems.push(`the "${section}" section is empty`);
  }
  return problems;
}

module.exports = { ARTIFACTS, checkArtifact, relativePathFor };
