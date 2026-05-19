function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  for (const arg of args) {
    if (arg.startsWith('--env=')) {
      params.env = arg.split('=')[1];
    } else if (arg.startsWith('--start=')) {
      params.start = arg.split('=')[1];
    } else if (arg.startsWith('--users=')) {
      params.users = arg.split('=')[1];
    }
  }

  const validEnvs = ['PROD', 'DR'];
  const validStarts = ['Y', 'N'];

  if (
    !params.env || !validEnvs.includes(params.env) ||
    !params.start || !validStarts.includes(params.start) ||
    !params.users || params.users.trim() === ''
  ) {
    console.error(`Usage: node src/index.js --env=<PROD|DR> --start=<Y|N> --users=<INITIALS,...>
  --env     PROD or DR   (selects ITCH server)
  --start   Y or N       (Y = fresh login, N = resume last session)
  --users   CSV string   (one or more user initials for log tagging)`);
    process.exit(1);
  }

  return params;
}

module.exports = { parseArgs };
