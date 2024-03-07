// Initialize necessary modules
const { parentPort, workerData } = require("worker_threads");
const dijkstra = require("dijkstra-calculator").DijkstraCalculator;

const { startIndex, endIndex, nodes, edges } = workerData; // Get data from the main thread

const graphJS = new dijkstra(); // Create a new instance of the Dijkstra class

// Add vertices and edges to the graph
nodes.forEach((node) => {
  graphJS.addVertex(node.id);
});

edges.forEach((edge) => {
  graphJS.addEdge(edge.from, edge.to, 1);
});

/**
 * This function calculates the partial matrix for the given range of nodes from the
 * startIndex to the endIndex given from main thread. It uses the Dijkstra algorithm to calculate the shortest
 * path between the nodes and stores the distances in the matrix.
 * @param {*} startIndex is the start index of the range of nodes
 * @param {*} endIndex is the end index of the range of nodes
 * @param {*} graph is the graph object
 * @param {*} nodes is the array of nodes
 * @returns the partial matrix, start index, end index and status
 */
function calculatePartialMatrix(startIndex, endIndex, graph, nodes) {
  let status = "";
  const partialMatrix = [];

  // Calculate the shortest path between the nodes and store the distances in the matrix
  for (let i = startIndex; i < endIndex; i++) {
    const row = [];
    for (let j = 0; j < nodes.length; j++) {
      const distance = graph.calculateShortestPath(
        nodes[i].id,
        nodes[j].id
      ).length;
      row.push(distance !== 0 ? distance : Infinity); // If the distance is 0, set it to Infinity, else set it to the distance
    }
    if (i !== endIndex - 1) {
      status = "Ongoing";
      parentPort.postMessage({ status }); // Send the status to the main thread, to update progression.
    } else {
      status = "Completed";
    }
    partialMatrix.push(row);
  }

  return { startIndex, endIndex, partialMatrix, status };
}

const partialMatrix = calculatePartialMatrix(
  startIndex,
  endIndex,
  graphJS,
  nodes
);

// Send the partial matrix, start index and end index to the main thread
parentPort.postMessage({ partialMatrix, startIndex, endIndex });
