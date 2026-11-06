// Installs an optional Tracker Pack from the kit into a project that already has the kit.
const fs = require('fs');
const path = require('path');
const { INSTALL_RECORD, KIT_ROOT, copyPlanned, trackerPlan } = require('./install');

function main(args) {
  const [action, name, projectArg] = args;
  if (action !== 'add' || !name) {
    console.error('usage: ourkit tracker add <name> [project-dir]');
    return 2;
  }
  const available = fs.readdirSync(path.join(KIT_ROOT, 'tracker-packs'));
  if (!available.includes(name)) {
    console.error(`ourkit: no Tracker Pack named ${name}; available: ${available.join(', ')}`);
    return 2;
  }
  const projectDir = path.resolve(projectArg || process.cwd());
  const recordFile = path.join(projectDir, INSTALL_RECORD);
  if (!fs.existsSync(recordFile)) {
    console.error(`ourkit: ourkit is not installed in ${projectDir}; run the Installer first`);
    return 2;
  }
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  if (record.tracker) {
    console.error(`ourkit: the ${record.tracker} Tracker Pack is already installed`);
    return 1;
  }
  const plan = trackerPlan(name);
  const inTheWay = plan.filter(({ target }) => fs.existsSync(path.join(projectDir, target)));
  if (inTheWay.length > 0) {
    console.error(`ourkit: nothing was changed; these files are in the way: ${inTheWay.map(({ target }) => target.replace(/\\/g, '/')).join(', ')}`);
    return 1;
  }
  const files = copyPlanned(projectDir, plan);
  const updated = { ...record, tracker: name, files: { ...record.files, ...files } };
  fs.writeFileSync(recordFile, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`ourkit: installed the ${name} Tracker Pack`);
  return 0;
}

module.exports = { main };
