// Rule layering: Core, then Roles, then Stack Packs, then Project Rules.
// A Role or Stack Pack is enabled by being installed in the project.
const fs = require('fs');
const path = require('path');

const KIT_DIR = path.join('.ourkit', 'kit');
const PROJECT_RULES = path.join('.ourkit', 'rules.md');
const PROJECT_ROLES = path.join('.ourkit', 'roles');

function markdownUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return markdownUnder(full);
      return entry.name.endsWith('.md') ? [full] : [];
    });
}

// Returns files from lowest to highest precedence.
function resolveLayers(projectDir) {
  const kit = path.join(projectDir, KIT_DIR);
  const layer = (name, files) => files.map((file) => ({ layer: name, file }));
  const projectRules = path.join(projectDir, PROJECT_RULES);
  return [
    ...layer('Core', markdownUnder(path.join(kit, 'core'))),
    ...layer('Role', markdownUnder(path.join(kit, 'roles'))),
    ...layer('Role', markdownUnder(path.join(projectDir, PROJECT_ROLES))),
    ...layer('Stack Pack', markdownUnder(path.join(kit, 'stack-packs'))),
    ...layer('Project Rules', fs.existsSync(projectRules) ? [projectRules] : []),
  ];
}

function renderRules(projectDir) {
  const sections = resolveLayers(projectDir).map(({ layer, file }) => {
    const relative = path.relative(projectDir, file).replace(/\\/g, '/');
    return `<!-- ${layer}: ${relative} -->\n${fs.readFileSync(file, 'utf8').trim()}`;
  });
  return ['<!-- When rules conflict, the later section wins. -->', ...sections].join('\n\n');
}

function main(projectArg) {
  console.log(renderRules(path.resolve(projectArg || process.cwd())));
  return 0;
}

module.exports = { KIT_DIR, PROJECT_RULES, main, renderRules, resolveLayers };
