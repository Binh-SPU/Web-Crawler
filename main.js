// Import nessessary modules
const fs = require("fs");
const readline = require("readline");
const { Worker } = require("worker_threads");

// Define constants
const MAX_CONCURRENT_REQUESTS = 10; // The maximum number of concurrent requests to fetch web pages as a time for performance optimization.
const NUM_THREADS = 8; // The number of virtual threads to be used for parallel processing for performance optimization.

/**
 * This function reads URLs from a file and returns an array of URLs.
 * It also validates the URLs by fetching them pre-crawling.
 * @param {*} filePath is the path to the file containing URLs.
 * @returns the array of URLs.
 */
async function readUrlsFromFile(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, "utf8");
    const urls = data.split("\n").map((url) => url.trim());

    await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`This URL does not pass validation: ${url}`);
        }
      })
    );

    return urls;
  } catch (error) {
    throw error;
  }
}

/**
 * This function takes a URL and returns the depth of the website.
 * It also take validation of the input from the user (must be a non-negative integer).
 * @param {*} url
 * @returns
 */
async function getDepthFromUser(url) {
  // Create an interface for reading input from the user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const depth = await new Promise((resolve, reject) => {
      rl.question(`Enter the depth of this website ${url}: `, (answer) => {
        rl.close();
        let depth = parseInt(answer); // Convert the input to an integer
        // Must be a non-negative integer
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

/**
 * This function takes an array of URLs and returns an array of depths.
 * @param {*} urls is the array of URLs.
 * @returns an array of depths.
 */
async function getArrayOfDepth(urls) {
  const depths = [];
  for (const url of urls) {
    const depth = await getDepthFromUser(url);
    depths.push(depth);
  }

  return depths;
}

/**
 * This function takes a URL and fetches its DOM content and parses it to extract all the links.
 * It also normalizes the links by converting relative links to absolute links.
 * It also prints the URL to the console to indicate the progress of the web crawling.
 * It also handles any errors that may occur during the process.
 * @param {*} url is the URL to be fetched and parsed.
 * @returns an object containing the URL and an array of links.
 */
async function fetchDomContentAndParsing(url) {
  try {
    // Fetch the URL, get the DOM content, and parse it to extract all the links
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

    // Remove any links that start with "about:"
    links = links.filter((link) => !link.startsWith("about:"));

    // Normalize the links by converting relative links to absolute links
    links = links.map((link) => {
      if (link.startsWith("//")) {
        const protocol = new URL(url).protocol;
        link = `${protocol}${link}`;
      } else if (
        link.startsWith("/") ||
        link.startsWith("?") ||
        link.startsWith("#")
      ) {
        const { origin } = new URL(url);
        link = `${origin}${link}`;
      } else {
        link = link;
      }
      return link;
    });

    // Print the URL to the console to indicate the progress of the web crawling
    process.stdout.write(`URL: ${url}\r`);

    return { url, links };
  } catch (error) {
    throw error;
  }
}

/**
 * This function takes an array of URLs and an array of depths and crawls the web to build a graph of the website.
 * It also prints the execution time of the web crawling to the console and skip any failed fetches.
 *
 * Algorithm: Breadth-First Search (BFS)
 *
 * The function traverses the web starting from the given URLs iteratively using a queue to keep track of the URLs to be visited,
 * and a set to keep track of the visited URLs to avoid visiting the same URL more than once, and a set to keep track of the nodes.
 * It traverse the graph width-wise ignoring any visited URLs and URLs that exceed the maximum depth.
 *
 * Why the usage of max concurrent requests? Because it is a performance optimization technique to improve the speed of the web crawling
 * since the web crawling is an I/O-bound operation. It is a good practice to limit the number of concurrent requests to avoid overwhelming the server
 * optimize the max cap to increase uptime and reduce the risk of being blocked by the server.
 *
 * @param {*} urls is the array of URLs to be crawled.
 * @param {*} depths is the array of depths of the websites.
 * @returns is an object containing the graph, nodes, and edges of the website.
 */
async function crawlWebsite(urls, depths) {
  try {
    // Throw an error if the number of URLs does not match the number of depths
    if (urls.length !== depths.length) {
      throw new Error(
        "The number of URLs does not match the number of depths."
      );
    }

    console.log("\nCrawling the web...\n");
    const startTime = performance.now();

    // Initialize the graph, visited URLs, node set, and queue
    const graph = {}; // The graph of the website
    const visitedUrls = new Set(); // The set of visited URLs
    const nodeSet = new Set(); // The set of nodes
    // The queue of URLs to be visited with their current depth and maximum depth
    const queue = urls.map((url, index) => ({
      url,
      currentDepth: 0,
      maxDepth: depths[index],
    }));

    // Traverse the web starting from the given URLs iteratively using a queue with its not empty
    while (queue.length > 0) {
      const promises = []; // The array of promises for concurrent requests
      /** Loop while the number of promises is under the constant MAX_CONCURRENT_REQUESTS and the queue is not empty */
      while (promises.length < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
        // Cutting the first element from the queue and assign it to the variables.
        const { url, currentDepth, maxDepth } = queue.shift();

        // If the current depth is less than the maximum depth (it) and the URL has not been visited yet
        if (currentDepth < maxDepth && !visitedUrls.has(url)) {
          visitedUrls.add(url); // Add the URL to the visited URLs set
          if (!nodeSet.has(url)) nodeSet.add(url); // Add the URL to the node set

          /** Take an array of promises then find the next array of links then push to the queue to be
           * looped again and again until the queue is empty. It should take 10 promises at a time
           * given the constant MAX_CONCURRENT_REQUESTS.
           */
          promises.push(
            fetchDomContentAndParsing(url)
              .then(({ url: currentUrl, links }) => {
                graph[currentUrl] = links; // Add the URL and its links to the graph

                // Add the links to the queue with their current depth and maximum depth
                links.forEach((link) => {
                  if (!visitedUrls.has(link)) {
                    if (!nodeSet.has(link)) nodeSet.add(link);
                    queue.push({
                      url: link,
                      currentDepth: currentDepth + 1,
                      maxDepth,
                    });
                  }
                });
              })
              .catch((error) => {
                console.error(`Error crawling URL ${url}:`, error.message);
              })
          );
        }
      }

      await Promise.all(promises); // Wait for all the promises to be resolved
    }

    // Create an array of nodes from the graph
    let nodeIndex = 1;
    const nodes = Array.from(nodeSet).map((url) => ({
      id: url,
      label: String(nodeIndex++),
    }));

    // Create an array of edges from the graph
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

    // Print the execution time of the web crawling to the console
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

/**
 * This function calculates the most central node in the graph and returns it.
 * It first creates a square matrix of the nodes and populates it with the shortest path distances between the nodes.
 * The matrix represents every vertex distance to every other vertex in the graph.
 * It then calculates the closeness centrality of each node based on this matrix and returns the most central node.
 *
 * @param {*} urls is the array of URLs.
 * @param {*} nodes is the array of nodes.
 * @param {*} edges is the array of edges.
 * @returns the most central node and a list of URLs with their closeness centrality sorted in descending order.
 */
async function GetMostCentralNode(urls, nodes, edges) {
  console.log("\nCalculating the most central node...\n");

  const startTime = performance.now();

  // Create a square matrix of the nodes with all the distances initialized to Infinity
  let matrix = createSquareMatrix(nodes);

  try {
    matrix = await SetTheWholeMatrix(matrix, nodes, edges); // Populate the matrix with the shortest path distances between the nodes

    // Calculate the closeness centrality of each node based on the matrix
    const closenessCentrality = [];
    const listUrls = [];
    let mostCentralNode = null;
    for (let i = 0; i < nodes.length; i++) {
      // The closeness centrality of a node is the reciprocal of the sum of its distances to all other nodes
      closenessCentrality[i] = 1.0 / GetSumOfDistance(matrix, i);
      if (
        // If the current node is the most central node so far or the first node, then update the most central node
        i === 0 ||
        closenessCentrality[i] > mostCentralNode.closenessCentrality
      ) {
        mostCentralNode = {
          id: nodes[i].id,
          closenessCentrality: closenessCentrality[i],
        };
      }
      // If the current node is in the list of URLs originally, then add it to the list of URLs with its closeness centrality
      if (urls.includes(nodes[i].id)) {
        listUrls.push({
          id: nodes[i].id,
          closenessCentrality: closenessCentrality[i],
        });
      }
    }

    // Sort the list of URLs with their closeness centrality in descending order
    listUrls.sort((a, b) => b.closenessCentrality - a.closenessCentrality);

    console.log("\nList of URLs with their closeness centrality: ", listUrls);

    const endTime = performance.now();

    console.log(
      `\nExecution time of Calculating the most central node: ${
        endTime - startTime
      } milliseconds\n`
    );
    console.log("Most central node: ", mostCentralNode, "\n");
    return { mostCentralNode, listUrls };
  } catch (error) {
    console.error(error); // Handle any errors that may occur
  }
}

/**
 * This function creates a square matrix of the nodes with all the distances initialized to Infinity.
 * @param {*} nodes is the array of nodes.
 * @returns a square matrix of the nodes with all the distances initialized to Infinity.
 */
function createSquareMatrix(nodes) {
  const matrix = [];
  for (let i = 0; i < nodes.length; i++) {
    matrix[i] = new Array(nodes.length).fill(Infinity);
  }

  return matrix;
}

/**
 * This function is used to populate the matrix with the shortest path distances between the nodes.
 * It uses parallel processing to improve the performance of the web crawling. It divides the work into multiple threads
 * and assigns each thread a portion of the matrix to populate. Each thread calculates the shortest path distances
 * between a subset of the nodes and then sends the results back to the main thread to be merged into the matrix.
 *
 * The function uses the worker_threads module to create multiple threads for parallel processing. Why the usage of worker_threads?
 * Because it is a performance optimization technique to improve the speed of calculation since this operation is a CPU-bound intensive operation.
 * Given the fact that Javascript is a single-threaded language, it is a good optimization to use worker_threads to take advantage of multi-core CPUs
 * and to improve the speed of the calculation.
 *
 * @param {*} matrix is the square matrix of the nodes with all the distances initialized to Infinity.
 * @param {*} nodes is the array of nodes.
 * @param {*} edges is the array of edges.
 * @returns the matrix populated with the shortest path distances between the nodes.
 */
async function SetTheWholeMatrix(matrix, nodes, edges) {
  // Divide the work into multiple threads and assign each thread a portion of the matrix to populate
  const chunkSize = Math.ceil(nodes.length / NUM_THREADS);
  const workers = []; // The array of workers for parallel processing

  // Create a worker for each thread and assign each worker a portion of the matrix to populate
  for (let i = 0; i < NUM_THREADS; i++) {
    const startIndex = i * chunkSize; // The start index of the portion of the submatrix
    const endIndex = Math.min((i + 1) * chunkSize, nodes.length); // The end index of the portion of the submatrix
    const worker = new Worker("./worker.js", {
      workerData: { startIndex, endIndex, edges, nodes }, // Send the information to the worker
    });
    // Logging the worker creation and its portion of the submatrix
    console.log(
      `Worker ${
        i + 1
      } created with startIndex: ${startIndex} and endIndex: ${endIndex}`
    );
    workers.push(worker); // Add the worker to the array of workers
  }

  // Wait for all the workers to finish populating their portions of the matrix
  return new Promise((resolve, reject) => {
    let completedWorkers = 0;
    let nodesProcessed = 0;

    // Listen for messages from the workers and merge the results into the matrix
    workers.forEach((worker) => {
      worker.on("message", (message) => {
        if (message.status === "Ongoing") {
          process.stdout.write(
            `Node ${++nodesProcessed}/${nodes.length} processed\r` // Print the progress to the console
          );
        } else {
          const { startIndex, endIndex, partialMatrix } = message.partialMatrix; // Get the information from the worker

          // Merge the results into the matrix
          for (let i = startIndex; i < endIndex; i++) {
            matrix[i] = partialMatrix[i - startIndex];
          }

          // Check if all the workers have finished populating their portions of the matrix
          completedWorkers++;
          if (completedWorkers === NUM_THREADS) {
            resolve(matrix);
          }
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

/**
 * This function calculates the sum of the distances of a node to all other nodes in the graph.
 * @param {*} matrix is the matrix of the nodes with the shortest path distances between them.
 * @param {*} index is the index of the node in the matrix.
 * @returns the sum of the distances of the node to all other nodes in the graph.
 */
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

/**
 * This function is the main function that orchestrates the web crawling and the calculation of the most central node.
 */
async function main() {
  try {
    const urls = await readUrlsFromFile("urls.txt");
    const depths = await getArrayOfDepth(urls);
    const { graph, nodes, edges } = await crawlWebsite(urls, depths);

    // Write the graph, nodes, and edges to JSON files
    fs.writeFileSync("graph_data.json", JSON.stringify(graph, null, 2));
    fs.writeFileSync("nodes.json", JSON.stringify(nodes, null, 2));
    fs.writeFileSync("edges.json", JSON.stringify(edges, null, 2));
    console.log("Web crawling completed successfully!");

    const { mostCentralNode, listUrls } = await GetMostCentralNode(
      urls,
      nodes,
      edges
    );

    // Write the most central node and the list of URLs with their closeness centrality to a JSON file
    fs.writeFileSync(
      "closeness_centrality_sorted_urls.json",
      JSON.stringify(listUrls, null, 2)
    );
  } catch (error) {
    console.error(error);
  }
}

main();
