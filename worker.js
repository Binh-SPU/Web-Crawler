const { parentPort, workerData } = require("worker_threads");
const dijkstra = require("dijkstra-calculator").DijkstraCalculator;

const { startIndex, endIndex, nodes, edges } = workerData;

const graphJS = new dijkstra();

nodes.forEach((node) => {
  graphJS.addVertex(node.id);
});

edges.forEach((edge) => {
  graphJS.addEdge(edge.from, edge.to, 1);
});

function calculatePartialMatrix(startIndex, endIndex, graph, nodes) {
  let status = "";
  const partialMatrix = [];
  for (let i = startIndex; i < endIndex; i++) {
    const row = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i !== j) {
        const distance = graph.calculateShortestPath(
          nodes[i].id,
          nodes[j].id
        ).length;
        row.push(distance !== 0 ? distance : Infinity);
      } else {
        row.push(Infinity);
      }
    }
    if (i !== endIndex - 1) {
      const message = `Node [${i}]/${endIndex} in thread ${startIndex} - ${endIndex} processed\r`;
      status = "Ongoing";
      parentPort.postMessage({ message, status });
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

parentPort.postMessage({ partialMatrix, startIndex, endIndex });
