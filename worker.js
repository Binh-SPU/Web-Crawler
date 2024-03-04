const { parentPort, workerData } = require("worker_threads");
const dijkstra = require("dijkstra-calculator").DijkstraCalculator;

const { startIndex, endIndex, nodes, edges, graph } = workerData;

const graphJS = new dijkstra();

nodes.forEach((node) => {
  graphJS.addVertex(node.id);
});

edges.forEach((edge) => {
  graphJS.addEdge(edge.from, edge.to, 1);
});

function calculatePartialMatrix(startIndex, endIndex, graph, nodes) {
  console.log(`Worker ${startIndex}-${endIndex} started!`);
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
    partialMatrix.push(row);
  }

  //   console.log(`Worker ${startIndex}-${endIndex} finished!`);
  //   console.log(`Partial matrix: ${partialMatrix}`);

  return { startIndex, endIndex, partialMatrix };
}

const partialMatrix = calculatePartialMatrix(
  startIndex,
  endIndex,
  graphJS,
  nodes
);

parentPort.postMessage({ partialMatrix, startIndex, endIndex });
