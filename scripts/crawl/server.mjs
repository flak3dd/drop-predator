import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT || "3001", 10);

createServer(async (req, res) => {
  const html = await readFile(join(dir, "index.html"), "utf-8");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
}).listen(port, () => console.log(`Crawl dashboard on http://localhost:${port}`));
