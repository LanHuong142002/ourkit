#!/usr/bin/env node
const [, , subcommand, ...args] = process.argv;

const subcommands = {
  check: () => require('../src/contract-check').main(args[0], args[1]),
  command: () => require('../src/stack-profile').main(args[0], args[1]),
  rules: () => require('../src/rules').main(args[0]),
  pack: () => require('../src/stack-pack').main(args[0], args[1], args[2]),
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
