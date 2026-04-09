module.exports = {
  apps: [{
    name: "snap-server",
    script: "src/index.ts",
    interpreter: "node",
    interpreter_args: "--import tsx",
    cwd: "/root/snap-projects/snap-server",
    env: {
      NODE_ENV: "production",
      PORT: 3101,
      SNAP_PUBLIC_BASE_URL: "https://snap.mxjxn.com",
    },
  }],
};
