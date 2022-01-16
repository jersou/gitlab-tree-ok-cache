#!/usr/bin/env node
// From https://gitlab.com/jersou/gitlab-tree-ok-cache/-/blob/skip-version/skip.js
// Implementation summary :
//     1. Check if the check has already been completed : check /tmp/ci-skip. If file exists, exit, else :
//     2. Get the "git ls-tree" of the tree "$SKIP_IF_TREE_OK_IN_PAST" of the current HEAD
//     3. Get last 1000 successful jobs of the project
//     4. Filter jobs : keep current job only
//     5. For each job :
//         1. Get the "git ls-tree" of the tree "$SKIP_IF_TREE_OK_IN_PAST"
//     2. Check if this "git ls-tree" equals the current HEAD "git ls-tree" (see 2.)
//     3. If the "git ls-tree" are equals, write true in /tmp/ci-skip and exit with code 0
//     6. If no job found, write false in /tmp/ci-skip and exit with code > 0
//
// ⚠️ Requirements :
//    - the variable SKIP_IF_TREE_OK_IN_PAST must contain the paths used by the job
//    - docker images/gitlab runner need :  git, nodejs, unzip (optional, used to extract artifacts)
//    - if the nested jobs of current uses the dependencies key with current, the dependencies files need to be in an artifact
//    - CI variables changes are not detected
//    - need API_READ_TOKEN (personal access tokens that have read_api scope)
//    - set GIT_DEPTH variable to 1000 or more
//
// usage in .gitlab-ci.yml file :
//     SERVICE-A:
// stage: test
// image: jersou/alpine-git-nodejs-unzip
// variables:
//     GIT_DEPTH: 10000
// SKIP_IF_TREE_OK_IN_PAST: service-A LIB-1 .gitlab-ci.yml skip.sh
// script:
//   - ./skip.js || service-A/test1.sh
//   - ./skip.js || service-A/test2.sh
//   - ./skip.js || service-A/test3.sh

const fs = require("fs");
const { spawn, execFileSync } = require("child_process");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const color = (color, msg) => console.error(`\x1b[${color}m  ${msg}  \x1b[0m`);
const red = (msg) => color("1;41;30", msg);
const yellow = (msg) => color("1;43;30", msg);
const green = (msg) => color("1;42;30", msg);
const ci_skip_path = `/tmp/ci-skip-${process.env.CI_PROJECT_ID}-${process.env.CI_JOB_ID}`;

if (!process.env.SKIP_IF_TREE_OK_IN_PAST) {
  red(
    "⚠️ The SKIP_IF_TREE_OK_IN_PAST variable is empty, set the list of paths to check"
  );
  process.exit(1);
}
if (!process.env.API_READ_TOKEN) {
  red("⚠️ The API_READ_TOKEN variable is empty !");
  process.exit(1);
}

if (fs.existsSync(ci_skip_path)) {
  const content = fs.readFileSync(ci_skip_path, "utf8").trim();
  process.exit(content === "true" ? 0 : 3);
}

function getTree(commit) {
  return execFileSync("git", [
    "ls-tree",
    commit,
    "--",
    ...process.env.SKIP_IF_TREE_OK_IN_PAST.split(" "),
  ]).toString();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    let client = url.match(/^https/) ? https : http;
    client
      .get(url, (resp) => {
        if (resp.statusCode !== 200) {
          reject(`Status Code: ${resp.statusCode} !`);
        }
        let data = "";
        resp.on("data", (chunk) => (data += chunk));
        resp.on("end", () => resolve(JSON.parse(data)));
      })
      .on("error", (err) => reject(err));
  });
}

function downloadFile(path, url) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path);
    let client = url.match(/^https/) ? https : http;
    client
      .get(url, (res) => {
        res.pipe(file);
        res.on("end", () => resolve());
      })
      .on("error", (err) => reject(err));
  });
}

async function extractArtifacts(job) {
  console.log(`artifacts_expire_at: ${job.artifacts_expire_at}`);
  if (job.artifacts_expire_at) {
    try {
      execFileSync("unzip", ["-h"]);
    } catch (error) {
      red("unzip not found, skip artifacts dl/extract.");
      return;
    }
    try {
      const artifactsPath = "artifacts.zip";
      console.log(`download artifacts.zip`);
      await downloadFile(
        artifactsPath,
        `${process.env.CI_API_V4_URL}/projects/${process.env.CI_PROJECT_ID}/jobs/${job.id}/artifacts?job_token=${process.env.CI_JOB_TOKEN}`
      );
      console.log(`unzip artifacts.zip`);
      execSync("unzip", [artifactsPath]);
      fs.unlinkSync(artifactsPath);
    } catch (e) {
      red("artifacts not found, expired ? → Don't skip");
      fs.writeFileSync(ci_skip_path, "false");
      process.exit(5);
    }
  }
}

async function main() {
  const current_tree = getTree("HEAD");
  console.log(`current_tree:\n${current_tree}\n------------`);
  const projectJobs = await fetchJson(
    `${process.env.CI_API_V4_URL}/projects/${process.env.CI_PROJECT_ID}/jobs?scope=success&per_page=1000&page=&private_token=${process.env.API_READ_TOKEN}`
  );
  const okJobCommits = projectJobs.filter(
    (job) => job.name === process.env.CI_JOB_NAME
  );
  for (const job of okJobCommits) {
    console.log(`check job ${job.id}`);
    try {
      const tree = getTree(job.commit.id);
      if (current_tree === tree) {
        await extractArtifacts(job);
        fs.writeFileSync(ci_skip_path, "true");
        green(`✅ tree found in job ${job.web_url}`);
        process.exit(0);
      }
    } catch (_) {}
  }
  fs.writeFileSync(ci_skip_path, "false");
  yellow("❌ tree not found in last 1000 success jobs of the project");
  process.exit(4);
}

main().then(() => console.log("end"));
