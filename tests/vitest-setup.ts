import path from "node:path";

process.env.FLEX_SCENES_QA_DATA_DIR = path.join(process.cwd(), ".artifacts", `vitest-data-${process.pid}`);
