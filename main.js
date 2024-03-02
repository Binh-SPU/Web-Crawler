const fs = require("fs");
const readline = require("readline");

const MAX_CONCURRENT_REQUESTS = 10;

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

    return { url, links };
  } catch (error) {
    throw error;
  }
}

async function crawlWebsite(urls, maxDepth) {
  try {
    const startTime = performance.now();

    const graph = {};
    const visitedUrls = new Set();
    const nodeSet = new Set();
    const queue = urls.map((url) => ({ url, currentDepth: 0 }));

    while (queue.length > 0) {
      const promises = [];

      while (promises.length < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
        const { url, currentDepth } = queue.shift();

        if (currentDepth < maxDepth && !visitedUrls.has(url)) {
          visitedUrls.add(url);
          if (!nodeSet.has(url)) nodeSet.add(url);

          promises.push(
            fetchDomContentAndParsing(url)
              .then(({ url: currentUrl, links }) => {
                graph[currentUrl] = links;

                links.forEach((link) => {
                  if (!visitedUrls.has(link)) {
                    if (!nodeSet.has(link)) nodeSet.add(link);
                    queue.push({ url: link, currentDepth: currentDepth + 1 });
                  }
                });
              })
              .catch((error) => {
                console.error(`Error crawling URL ${url}:`, error.message);
              })
          );
        }
      }

      await Promise.all(promises);
    }

    let nodeIndex = 1;
    const nodes = Array.from(nodeSet).map((url) => ({
      id: url,
      label: String(nodeIndex++),
    }));

    let edgeIndex = 1;
    const edges = [];
    for (const [source, targets] of Object.entries(graph)) {
      targets.forEach((target) => {
        edges.push({
          index: edgeIndex++,
          from: source,
          to: target,
          arrows: "to",
        });
      });
    }

    const endTime = performance.now();
    const executionTime = endTime - startTime;
    console.log(`Execution time: ${executionTime} milliseconds`);

    return { graph, nodes, edges };
  } catch (error) {
    throw error;
  }
}

async function main() {
  try {
    const depth = await getDepthFromUser();
    const urls = await readUrlsFromFile("urls.txt");
    const { graph, nodes, edges } = await crawlWebsite(urls, depth);

    // Example: Write graph data to a file
    fs.writeFileSync("graph_data.json", JSON.stringify(graph, null, 2));
    fs.writeFileSync("nodes.json", JSON.stringify(nodes, null, 2));
    fs.writeFileSync("edges.json", JSON.stringify(edges, null, 2));
    console.log("Web crawling completed successfully!");
  } catch (error) {
    console.error(error);
  }
}

main();
