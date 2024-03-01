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

async function fetchDomContentAndParsing(url) {
  try {
    const fetchModule = await import("node-fetch");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    const html = await response.text();
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(html);
    const document = dom.window.document;
    let links = Array.from(document.querySelectorAll("a[href]")).map(
      (link) => link.href
    );

    links = links.filter((link) => !link.startsWith("about:"));

    links = links.map((link) => {
      if (link.startsWith("//")) {
        const protocol = new URL(url).protocol;
        link = `${protocol}${link}`;
      } else if (link.startsWith("/")) {
        const { origin } = new URL(url);
        link = `${origin}${link}`;
      } else {
        link = link;
      }
      return link;
    });

    console.log(`URL: ${url}`);
    // console.log(`Links: ${links}`);
    // console.log("----------------------------------------------------\n");

    return { url, links };
  } catch (error) {
    throw error;
  }
}

async function crawlWebsite(urls, depth) {
  try {
    const visitedUrls = new Set();
    const graph = {};
    async function crawl(url, currentDepth) {
      try {
        if (currentDepth <= depth && !visitedUrls.has(url)) {
          visitedUrls.add(new URL(url).href);
          //   console.log(`Depth: ${currentDepth}`);
          const { url: currentUrl, links } = await fetchDomContentAndParsing(
            url
          );
          graph[currentUrl] = links;
          for (const link of links) {
            await crawl(link, currentDepth + 1);
          }
        }
      } catch (error) {
        console.error(`Error crawling URL ${url}:`, error.message);
        // You can add additional error handling or logging here if needed
      }
    }

    await Promise.all(
      urls.map(async (url) => {
        await crawl(url, 0);
      })
    );

    return { graph, visitedUrls };
  } catch (error) {
    console.log(error);
  }
}

async function main() {
  try {
    const depth = await getDepthFromUser();
    const urls = await readUrlsFromFile("urls.txt");
    const { graph, visitedUrls } = await crawlWebsite(urls, depth);

    // Example: Write graph data to a file
    fs.writeFileSync("graph_data.json", JSON.stringify(graph, null, 2));
    console.log("Graph data has been written to graph_data.json");
  } catch (error) {
    console.error(error);
  }
}

main();
