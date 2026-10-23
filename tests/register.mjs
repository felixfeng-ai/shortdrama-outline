import { register } from "node:module"
import path from "node:path"

const configuredDataDir = process.env.CHENGJU_DATA_DIR?.trim()
const dataDir = configuredDataDir && configuredDataDir !== "undefined"
  ? configuredDataDir
  : path.join(process.cwd(), "data")
process.env.CHENGJU_GENERATED_DIR = path.join(dataDir, "tmp", "generated")

register("./loader.mjs", import.meta.url)
