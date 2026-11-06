#!/usr/bin/env node
const [, , subcommand, ...args] = process.argv;

const subcommands = {
  'active-change': () => require('../src/active-change').main(args[0]),
  baseline: () => require('../src/baseline').main(args[0]),
  check: () => require('../src/contract-check').main(args[0], args[1]),
  command: () => require('../src/stack-profile').main(args[0], args[1]),
  rules: () => require('../src/rules').main(args[0]),
  pending: () => require('../src/connectors').main(args),
  pack: () => require('../src/stack-pack').main(args[0], args[1], args[2]),
  decision: () => require('../src/mode').decisionMain(args),
  mode: () => require('../src/mode').modeMain(args),
  question: () => require('../src/mode').questionMain(args),
  tier: () => require('../src/tier').main(args),
  ticket: () => require('../src/ticket-standard').main(args),
  upgrade: () => require('../src/upgrade').main(args),
};

async function run() {
  if (Object.hasOwn(subcommands, subcommand)) return subcommands[subcommand]();
  return require('../src/install').main(process.argv.slice(2));
}

run().then((code) => {
  process.exitCode = code;
});
