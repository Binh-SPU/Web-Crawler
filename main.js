const fs = require("fs");
const readline = require("readline");
const dijkstra = require("dijkstra-calculator").DijkstraCalculator;
const { Worker, Mes } = require("worker_threads");

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
    console.log("\nCrawling the web...\n");
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
    console.log(
      `\nExecution time of Fetching Web: ${executionTime} milliseconds`
    );
    console.log("Finished crawling the web.\n");

    return { graph, nodes, edges };
  } catch (error) {
    throw error;
  }
}

function GetMostCentralNode(nodes, edges) {
  console.log("\nCalculating the most central node...\n");

  const startTime = performance.now();
  const graphJS = new dijkstra();

  nodes.forEach((node) => {
    graphJS.addVertex(node.id);
  });

  edges.forEach((edge) => {
    graphJS.addEdge(edge.from, edge.to, 1);
  });

  let matrix = createSquareMatrix(nodes);

  SetTheWholeMatrix(graphJS, matrix, nodes, edges)
    .then((resultMatrix) => {
      console.log("Matrix: ", resultMatrix[0]);
      return (matrix = resultMatrix);
    })
    .catch((error) => {
      console.error(error); // Handle any errors that may occur
    });

  // console.log("Matrix: ", matrix);

  const inverseDistances = [];
  let mostCentralNode = null;
  for (let i = 0; i < nodes.length; i++) {
    inverseDistances[i] = 1.0 / GetSumOfDistance(matrix, i);
    if (i === 0) {
      mostCentralNode = {
        id: nodes[i].id,
        inverseDistance: inverseDistances[i],
      };
    }
    if (inverseDistances[i] > mostCentralNode.inverseDistance) {
      mostCentralNode = {
        id: nodes[i].id,
        inverseDistance: inverseDistances[i],
      };
    }
  }

  const endTime = performance.now();

  console.log(
    `Execution time of Calculating the most central node: ${
      endTime - startTime
    } milliseconds`
  );
  console.log("Most central node: ", mostCentralNode, "\n");
  return mostCentralNode;
}

function createSquareMatrix(nodes) {
  const matrix = [];
  for (let i = 0; i < nodes.length; i++) {
    matrix[i] = new Array(nodes.length).fill(0);
  }

  return matrix;
}

function Set1SlotInMatrix(matrix, from, to, value) {
  matrix[from][to] = value;
}

function SetTheWholeMatrix(graph, matrix, nodes, edges) {
  const numThreads = 4;
  const chunkSize = Math.ceil(nodes.length / numThreads);
  const workers = [];

  for (let i = 0; i < numThreads; i++) {
    const startIndex = i * chunkSize;
    const endIndex = Math.min((i + 1) * chunkSize, nodes.length);
    const worker = new Worker("./worker.js", {
      workerData: { startIndex, endIndex, edges, nodes },
    });
    workers.push(worker);
  }

  return new Promise((resolve, reject) => {
    let completedWorkers = 0;

    workers.forEach((worker) => {
      worker.on("message", (message) => {
        // console.log("Received message:", message);
        const { startIndex, endIndex, partialMatrix } = message.partialMatrix;

        for (let i = startIndex; i < endIndex; i++) {
          matrix[i] = partialMatrix[i - startIndex];
        }

        // console.log(`matrix: ${matrix}`);

        completedWorkers++;
        if (completedWorkers === numThreads) {
          resolve(matrix);
        }
      });

      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  });
}

// function SetTheWholeMatrix(graph, matrix, nodes) {
//   for (let i = 0; i < nodes.length; i++) {
//     process.stdout.write(`Node ${i + 1}/${nodes.length}\r`);
//     for (let j = 0; j < nodes.length; j++) {
//       if (i !== j) {
//         const distance = graph.calculateShortestPath(
//           nodes[i].id,
//           nodes[j].id
//         ).length;
//         distance !== 0
//           ? Set1SlotInMatrix(matrix, i, j, distance)
//           : Set1SlotInMatrix(matrix, i, j, Infinity);
//       } else {
//         Set1SlotInMatrix(matrix, i, j, Infinity);
//       }
//     }
//   }

//   return matrix;
// }

function GetSumOfDistance(matrix, index) {
  let sum = 0;
  sum = matrix[index].reduce((acc, curr) => {
    if (curr !== Infinity) {
      return acc + curr;
    }
    return acc;
  }, 0);

  return sum;
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

    const mostCentralNode = GetMostCentralNode(nodes, edges);
  } catch (error) {
    console.error(error);
  }
}

main();
