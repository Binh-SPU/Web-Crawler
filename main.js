const fs = require("fs");
const { resolve } = require("path");
const readline = require("readline");

async function readUrlsFromFile(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, "utf8");
    const urls = data.split("\n").map((url) => url.trim());
    return urls;
  } catch (error) {
    throw error;
  }
}

async function getDepthFromUser() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const depth = await new Promise((resolve, reject) => {
      rl.question("Enter the depth of the crawl: ", (answer) => {
        rl.close();
        let depth = parseInt(answer);
        if (isNaN(depth) || depth < 0) {
          reject(new Error("Depth must be a non-negative integer."));
        } else {
          resolve(depth);
        }
      });
    });
    return depth;
  } catch (error) {
    throw error;
  }
}

getDepthFromUser()
  .then((depth) => {
    console.log(`Crawling with depth: ${depth}`);
    return readUrlsFromFile("urls.txt");
  })
  .then((urls) => {
    console.log(urls);
  })
  .catch((error) => {
    console.error(error);
  });
