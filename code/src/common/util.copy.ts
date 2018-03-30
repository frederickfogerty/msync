import * as Rsync from 'rsync';
import { fsPath, fs } from './libs';
import { IModule } from '.';

interface IRsyncResult {
  err: Error;
  code: number;
  cmd: string;
}
function rsyncExecute(rsync: any): Promise<IRsyncResult> {
  return new Promise<IRsyncResult>((resolve, reject) => {
    rsync.execute((err: Error, code: number, cmd: string) => {
      if (err) {
        reject(err);
      } else {
        resolve({ err, code, cmd });
      }
    });
  });
}

/**
 * Copies the module using RSync.
 */
export async function module(
  from: { name: string; dir: string },
  to: { name: string; dir: string },
) {
  // Setup initial conditions.
  const IGNORE = ['.DS_Store', 'node_modules', '.tmp'];
  const FROM_DIR = fsPath.join(from.dir, '/');
  const TO_DIR = fsPath.join(to.dir, 'node_modules', from.name, '/');

  // Perform high-speed copy operation.
  await fs.ensureDirAsync(TO_DIR);
  const rsync = new Rsync()
    .source(FROM_DIR)
    .destination(TO_DIR)
    .exclude(IGNORE)
    .delete()
    .flags('aW');
  await rsyncExecute(rsync);
}

/**
 * Logs an update to target module that has been updated.
 * This causes [nodemon] to restart, which is necessary because
 * [nodemon] ignore the `node_modules` dir.
 */
export async function logUpdate(target: IModule) {
  if (target.isIgnored || !target.tsconfig) {
    return;
  }

  // Get the transpiled typsecript directory to write to.
  const dir = fsPath.join(target.dir, target.tsconfig.compilerOptions.outDir);
  if (!await fs.existsAsync(dir)) {
    return;
  }

  // Write the file.
  const file = fsPath.join(dir, '__msync.js');
  const getTotal = async () => {
    if (!await fs.existsAsync(file)) {
      return 0;
    }
    const text = (await fs.readFileAsync(file)).toString();
    for (const line of text.split('\n')) {
      if (line.trim().startsWith('saveTotal')) {
        return parseInt(line.split(':')[1], 10) + 1;
      }
    }
    return 0;
  };

  const total = await getTotal();
  const text = `
/*
  TEMPORARY FILE GENERATED BY
  MSync (https://github.com/philcockfield/msync)
  This file causes [nodemon] to restart. It is safe to delete this file.

  saveTotal: ${total}
*/
`;
  await fs.writeFileAsync(file, text);
}
