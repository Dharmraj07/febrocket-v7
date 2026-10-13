const config = require("../config");

function startTransformationWorker() {
  console.log("Transformation worker initialized.", {
    queueName: config.transformationQueueName,
    concurrency: config.transformationWorkerConcurrency,
  });

  return {
    close: async () => {
      console.log("Transformation worker shutdown complete.");
    },
  };
}

module.exports = {
  startTransformationWorker,
};
