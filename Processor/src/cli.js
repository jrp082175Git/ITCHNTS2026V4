function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  for (const arg of args) {
    if (arg.startsWith('--start=')) {
      params.start = arg.split('=')[1];
    } else if (arg.startsWith('--users=')) {
      params.users = arg.split('=')[1];
    }
  }

  const validStarts = ['Y', 'N'];

  if (
    !params.start || !validStarts.includes(params.start) ||
    !params.users || params.users.trim() === ''
  ) {
    console.error(`Usage: node src/index.js --start=<Y|N> --users=<INITIALS,...>
  --start   Y or N       (Y = expected seq starts at 1, N = resume from last+1)
  --users   CSV string   (one or more user initials for log tagging)`);
    process.exit(1);
  }

  // Determine starting sequence logically based on Y/N later during startup,
  // but we initialize the structure here.
  let expectedSequence = 1;

  return Object.freeze({
    start: params.start,
    users: params.users,
    expectedSequence // Base starting point, to be mutated/overwritten after Redis load if N.
  });
}

module.exports = { parseArgs };
