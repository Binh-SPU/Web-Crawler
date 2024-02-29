const fs = require("fs");
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

async function fetchDomContent(url) {
  try {
    const fetchModule = await import("node-fetch");
    const response = await fetchModule.default(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    const html = await response.text();
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const links = Array.from(document.querySelectorAll("a[href]")).map(
      (link) => link.href
    );

    console.log(`Links: ${links}`);

    return { url, links, document };
  } catch (error) {
    throw error;
  }
}

async function crawlWebsite(urls) {
  try {
    for (const url of urls) {
      console.log(`Fetching DOM content of ${url}`);
      const { document } = await fetchDomContent(url);
      console.log(document.title);
    }
  } catch (error) {
    console.log(error);
  }
}
async function main() {
  try {
    const depth = await getDepthFromUser();
    const urls = await readUrlsFromFile("urls.txt");
    await crawlWebsite(urls);
  } catch (error) {
    console.error(error);
  }
}

main();
