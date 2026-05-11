import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const links = [
  {
    source:
      "../assets/Phase 1 - Construction Zone/ROOMS/compressed/construction-1080-crf24-audio.mp4",
    target: "public/media/rooms/construction.mp4",
  },
  {
    source:
      "../assets/Phase 1 - Construction Zone/ROOMS/compressed/hq-1080-crf24-audio.mp4",
    target: "public/media/rooms/hq.mp4",
  },
];

for (const link of links) {
  const source = resolve(link.source);
  const target = resolve(link.target);
  const targetDir = dirname(target);

  if (!existsSync(source)) {
    throw new Error(`Missing source media: ${source}`);
  }

  mkdirSync(targetDir, { recursive: true });

  if (existsSync(target)) {
    const stat = lstatSync(target);

    if (!stat.isSymbolicLink()) {
      throw new Error(`Refusing to replace non-symlink: ${target}`);
    }

    rmSync(target);
  }

  symlinkSync(relative(targetDir, source), target);
  console.log(`Linked ${link.target}`);
}
