import {
  R,
  log,
  loadSettings,
  constants,
  filter,
  IModule,
  inquirer,
  semver,
  dependsOn,
  updatePackageRef,
  savePackage,
  table,
  ITable,
} from '../common';
import * as listCommand from './ls.cmd';

export const name = 'bump';
export const description = 'dependant';
export const args = {
  '-i': 'Include ignored modules.',
  '-d': 'Dry run where no files are saved.',
  '-l': 'Local versions only. Does not retrieve NPM details.',
};

export type ReleaseType = 'major' | 'minor' | 'patch';


/**
 * CLI command.
 */
export async function cmd(
  args?: {
    params: string[],
    options: {
      i?: boolean;
      d?: boolean;
      l?: boolean;
    },
  },
) {
  const options = (args && args.options) || {};
  await bump({
    includeIgnored: options.i || false,
    local: options.l || false,
    dryRun: options.d || false,
  });
}



export interface IOptions {
  includeIgnored?: boolean;
  local?: boolean;
  dryRun?: boolean;
}



/**
 * Bumps a module version and all references to it in dependant modules.
 */
export async function bump(options: IOptions = {}) {
  const { includeIgnored = false, local = false, dryRun = false } = options;
  const save = !dryRun;
  const npm = !local;
  const settings = await loadSettings({ npm, spinner: npm });
  if (!settings) {
    log.warn.yellow(constants.CONFIG_NOT_FOUND_ERROR);
    return;
  }
  const modules = settings
    .modules
    .filter((pkg) => filter.includeIgnored(pkg, includeIgnored));

  // Prompt for the module to bump.
  const module = await promptForModule(modules);
  if (!module) { return; }

  // Retrieve the dependant modules and list them in a table.
  const dependants = dependsOn(module, modules);
  listCommand.printTable([module], { includeIgnored: true, dependants });
  if (dryRun) {
    log.info.gray(`Dry run...no files will be saved.\n`);
  }

  // Get the version number.
  const release = await promptForReleaseType(module.version);
  if (!release) { return; }

  // Update the selected module and all dependant modules.
  log.info();
  const tableBuilder = await bumpModule({
    release,
    pkg: module,
    allModules: modules,
    save,
  });
  tableBuilder.log();

  if (dryRun) {
    log.info.gray(`\nNo files were saved.`);
  } else {
    log.info();
  }
}



export interface IBumpOptions {
  release: ReleaseType;
  pkg: IModule;
  allModules: IModule[];
  save: boolean;
  level?: number;
  ref?: { name: string, version: string };
  table?: ITable;
}

async function bumpModule(options: IBumpOptions) {
  // Setup initial conditions.
  const { release, pkg, allModules, save, level = 0, ref } = options;
  const dependants = dependsOn(pkg, allModules);
  const version = semver.inc(pkg.latest, release);
  const isRoot = ref === undefined;

  // Log output.
  const tableBuilder = options.table || table({
    head: ['update', 'module', 'version', 'ref updated'],
  });

  if (!ref) {
    let msg = '';
    msg += `  ${release.toUpperCase()} `;
    msg += `update ${log.magenta(pkg.name)} to version ${log.magenta(version)} `;
    log.info.cyan(msg);
  } else {
    tableBuilder
      .add([
        log.cyan(release.toUpperCase()),
        log.magenta(pkg.name),
        log.magenta(version),
        log.yellow(`${ref.name} (${ref.version})`),
      ]);
    // tableBuilder.log();
  }



  // Update the selected module.
  const json = R.clone<any>(pkg.json);
  json.version = version;
  if (save) {
    await savePackage(pkg.dir, json);
  }

  // Update all dependant modules.
  if (isRoot && dependants.length > 0) {
    log.info.gray('\nDependant modules:');
  }

  for (const dependentPkg of dependants) {
    await updatePackageRef(dependentPkg, pkg.name, version, { save });
    await bumpModule({
      release: 'patch',
      pkg: dependentPkg,
      allModules,
      level: level + 1,
      ref: { name: pkg.name, version },
      save,
      table: tableBuilder,
    });
  }
  return tableBuilder;
}



async function promptForModule(modules: IModule[]) {
  const choices = modules.map((pkg) => ({ name: pkg.name, value: pkg.name }));
  const confirm = {
    type: 'list',
    name: 'name',
    message: 'Select a module',
    choices,
  };
  const name = (await inquirer.prompt(confirm)).name;
  return modules.find((pkg) => pkg.name === name);
}



async function promptForReleaseType(version: string) {
  const choices = ['patch', 'minor', 'major'];
  const confirm = {
    type: 'list',
    name: 'name',
    message: 'Release',
    choices,
  };
  return (await inquirer.prompt(confirm)).name;
}