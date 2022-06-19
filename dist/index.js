"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* tslint:disable:no-shadowed-variable */
const dotenv_1 = __importDefault(require("dotenv"));
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const url_1 = require("url");
const util_1 = require("util");
const yargs_1 = __importDefault(require("yargs"));
const Distribution_struct_1 = require("./structure/spec_model/Distribution.struct");
const Server_struct_1 = require("./structure/spec_model/Server.struct");
const VersionSegmentedRegistry_1 = require("./util/VersionSegmentedRegistry");
const versionutil_1 = require("./util/versionutil");
const MinecraftVersion_1 = require("./util/MinecraftVersion");
const LoggerUtil_1 = require("./util/LoggerUtil");
const SchemaUtil_1 = require("./util/SchemaUtil");
dotenv_1.default.config();
const logger = LoggerUtil_1.LoggerUtil.getLogger('Index');
function getRoot() {
    return (0, path_1.resolve)(process.env.ROOT);
}
function getHeliosDataFolder() {
    if (process.env.HELIOS_DATA_FOLDER) {
        return (0, path_1.resolve)(process.env.HELIOS_DATA_FOLDER);
    }
    return null;
}
function getBaseURL() {
    let baseUrl = process.env.BASE_URL;
    // Users must provide protocol in all other instances.
    if (baseUrl.indexOf('//') === -1) {
        if (baseUrl.toLowerCase().startsWith('localhost')) {
            baseUrl = 'http://' + baseUrl;
        }
        else {
            throw new TypeError('Please provide a URL protocol (ex. http:// or https://)');
        }
    }
    return (new url_1.URL(baseUrl)).toString();
}
function installLocalOption(yargs) {
    return yargs.option('installLocal', {
        describe: 'Install the generated distribution to your local Helios data folder.',
        type: 'boolean',
        demandOption: false,
        global: false,
        default: false
    });
}
function discardOutputOption(yargs) {
    return yargs.option('discardOutput', {
        describe: 'Delete cached output after it is no longer required. May be useful if disk space is limited.',
        type: 'boolean',
        demandOption: false,
        global: false,
        default: false
    });
}
function invalidateCacheOption(yargs) {
    return yargs.option('invalidateCache', {
        describe: 'Invalidate and delete existing caches as they are encountered. Requires fresh cache generation.',
        type: 'boolean',
        demandOption: false,
        global: false,
        default: false
    });
}
// function rootOption(yargs: yargs.Argv) {
//     return yargs.option('root', {
//         describe: 'File structure root.',
//         type: 'string',
//         demandOption: true,
//         global: true
//     })
//     .coerce({
//         root: resolvePath
//     })
// }
// function baseUrlOption(yargs: yargs.Argv) {
//     return yargs.option('baseUrl', {
//         describe: 'Base url of your file host.',
//         type: 'string',
//         demandOption: true,
//         global: true
//     })
//     .coerce({
//         baseUrl: (arg: string) => {
//             // Users must provide protocol in all other instances.
//             if (arg.indexOf('//') === -1) {
//                 if (arg.toLowerCase().startsWith('localhost')) {
//                     arg = 'http://' + arg
//                 } else {
//                     throw new TypeError('Please provide a URL protocol (ex. http:// or https://)')
//                 }
//             }
//             return (new URL(arg)).toString()
//         }
//     })
// }
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function namePositional(yargs) {
    return yargs.option('name', {
        describe: 'Distribution index file name.',
        type: 'string',
        default: 'distribution'
    });
}
// -------------
// Init Commands
const initRootCommand = {
    command: 'root',
    describe: 'Generate an empty standard file structure.',
    builder: (yargs) => {
        // yargs = rootOption(yargs)
        return yargs;
    },
    handler: async (argv) => {
        argv.root = getRoot();
        logger.debug(`Root set to ${argv.root}`);
        logger.debug('Invoked init root.');
        try {
            await (0, SchemaUtil_1.generateSchemas)(argv.root);
            await new Distribution_struct_1.DistributionStructure(argv.root, '', false, false).init();
            logger.info(`Successfully created new root at ${argv.root}`);
        }
        catch (error) {
            logger.error(`Failed to init new root at ${argv.root}`, error);
        }
    }
};
const initCommand = {
    command: 'init',
    aliases: ['i'],
    describe: 'Base init command.',
    builder: (yargs) => {
        return yargs
            .command(initRootCommand);
    },
    handler: (argv) => {
        argv._handled = true;
    }
};
// -----------------
// Generate Commands
const generateServerCommand = {
    command: 'server <id> <version>',
    describe: 'Generate a new server configuration.',
    builder: (yargs) => {
        // yargs = rootOption(yargs)
        return yargs
            .positional('id', {
            describe: 'Server id.',
            type: 'string'
        })
            .positional('version', {
            describe: 'Minecraft version.',
            type: 'string'
        })
            .option('forge', {
            describe: 'Forge version.',
            type: 'string',
            default: null
        });
    },
    handler: async (argv) => {
        argv.root = getRoot();
        logger.debug(`Root set to ${argv.root}`);
        logger.debug(`Generating server ${argv.id} for Minecraft ${argv.version}.`, `\n\t└ Forge version: ${argv.forge}`);
        const minecraftVersion = new MinecraftVersion_1.MinecraftVersion(argv.version);
        if (argv.forge != null) {
            if (versionutil_1.VersionUtil.isPromotionVersion(argv.forge)) {
                logger.debug(`Resolving ${argv.forge} Forge Version..`);
                const version = await versionutil_1.VersionUtil.getPromotedForgeVersion(minecraftVersion, argv.forge);
                logger.debug(`Forge version set to ${version}`);
                argv.forge = version;
            }
        }
        const serverStruct = new Server_struct_1.ServerStructure(argv.root, getBaseURL(), false, false);
        serverStruct.createServer(argv.id, minecraftVersion, {
            forgeVersion: argv.forge
        });
    }
};
const generateDistroCommand = {
    command: 'distro [name]',
    describe: 'Generate a distribution index from the root file structure.',
    builder: (yargs) => {
        yargs = installLocalOption(yargs);
        yargs = discardOutputOption(yargs);
        yargs = invalidateCacheOption(yargs);
        yargs = namePositional(yargs);
        return yargs;
    },
    handler: async (argv) => {
        argv.root = getRoot();
        argv.baseUrl = getBaseURL();
        const finalName = `${argv.name}.json`;
        logger.debug(`Root set to ${argv.root}`);
        logger.debug(`Base Url set to ${argv.baseUrl}`);
        logger.debug(`Install option set to ${argv.installLocal}`);
        logger.debug(`Discard Output option set to ${argv.discardOutput}`);
        logger.debug(`Invalidate Cache option set to ${argv.invalidateCache}`);
        logger.debug(`Invoked generate distro name ${finalName}.`);
        const doLocalInstall = argv.installLocal;
        const discardOutput = argv.discardOutput ?? false;
        const invalidateCache = argv.invalidateCache ?? false;
        const heliosDataFolder = getHeliosDataFolder();
        if (doLocalInstall && heliosDataFolder == null) {
            logger.error('You MUST specify HELIOS_DATA_FOLDER in your .env when using the --installLocal option.');
            return;
        }
        try {
            const distributionStruct = new Distribution_struct_1.DistributionStructure(argv.root, argv.baseUrl, discardOutput, invalidateCache);
            const distro = await distributionStruct.getSpecModel();
            const distroOut = JSON.stringify(distro, null, 2);
            const distroPath = (0, path_1.resolve)(argv.root, finalName);
            (0, fs_extra_1.writeFile)(distroPath, distroOut);
            logger.info(`Successfully generated ${finalName}`);
            logger.info(`Saved to ${distroPath}`);
            logger.debug('Preview:\n', distro);
            if (doLocalInstall) {
                const finalDestination = (0, path_1.resolve)(heliosDataFolder, finalName);
                logger.info(`Installing distribution to ${finalDestination}`);
                (0, fs_extra_1.writeFile)(finalDestination, distroOut);
                logger.info('Success!');
            }
        }
        catch (error) {
            logger.error(`Failed to generate distribution with root ${argv.root}.`, error);
        }
    }
};
const generateSchemasCommand = {
    command: 'schemas',
    describe: 'Generate json schemas.',
    handler: async (argv) => {
        argv.root = getRoot();
        logger.debug(`Root set to ${argv.root}`);
        logger.debug('Invoked generate schemas.');
        try {
            await (0, SchemaUtil_1.generateSchemas)(argv.root);
            logger.info('Successfully generated schemas');
        }
        catch (error) {
            logger.error(`Failed to generate schemas with root ${argv.root}.`, error);
        }
    }
};
const generateCommand = {
    command: 'generate',
    aliases: ['g'],
    describe: 'Base generate command.',
    builder: (yargs) => {
        return yargs
            .command(generateServerCommand)
            .command(generateDistroCommand)
            .command(generateSchemasCommand);
    },
    handler: (argv) => {
        argv._handled = true;
    }
};
const validateCommand = {
    command: 'validate [name]',
    describe: 'Validate a distribution.json against the spec.',
    builder: (yargs) => {
        return namePositional(yargs);
    },
    handler: (argv) => {
        logger.debug(`Invoked validate with name ${argv.name}.json`);
    }
};
const latestForgeCommand = {
    command: 'latest-forge <version>',
    describe: 'Get the latest version of forge.',
    handler: async (argv) => {
        logger.debug(`Invoked latest-forge with version ${argv.version}.`);
        const minecraftVersion = new MinecraftVersion_1.MinecraftVersion(argv.version);
        const forgeVer = await versionutil_1.VersionUtil.getPromotedForgeVersion(minecraftVersion, 'latest');
        logger.info(`Latest version: Forge ${forgeVer} (${argv.version})`);
    }
};
const recommendedForgeCommand = {
    command: 'recommended-forge <version>',
    describe: 'Get the recommended version of forge. Returns latest if there is no recommended build.',
    handler: async (argv) => {
        logger.debug(`Invoked recommended-forge with version ${argv.version}.`);
        const index = await versionutil_1.VersionUtil.getPromotionIndex();
        const minecraftVersion = new MinecraftVersion_1.MinecraftVersion(argv.version);
        let forgeVer = versionutil_1.VersionUtil.getPromotedVersionStrict(index, minecraftVersion, 'recommended');
        if (forgeVer != null) {
            logger.info(`Recommended version: Forge ${forgeVer} (${minecraftVersion})`);
        }
        else {
            logger.info(`No recommended build for ${minecraftVersion}. Checking for latest version..`);
            forgeVer = versionutil_1.VersionUtil.getPromotedVersionStrict(index, minecraftVersion, 'latest');
            if (forgeVer != null) {
                logger.info(`Latest version: Forge ${forgeVer} (${minecraftVersion})`);
            }
            else {
                logger.info(`No build available for ${minecraftVersion}.`);
            }
        }
    }
};
const testCommand = {
    command: 'test <mcVer> <forgeVer>',
    describe: 'Validate a distribution.json against the spec.',
    builder: (yargs) => {
        return namePositional(yargs);
    },
    handler: async (argv) => {
        logger.debug(`Invoked test with mcVer ${argv.mcVer} forgeVer ${argv.forgeVer}`);
        logger.info(process.cwd());
        const mcVer = new MinecraftVersion_1.MinecraftVersion(argv.mcVer);
        const resolver = VersionSegmentedRegistry_1.VersionSegmentedRegistry.getForgeResolver(mcVer, argv.forgeVer, getRoot(), '', getBaseURL(), false, false);
        if (resolver != null) {
            const mdl = await resolver.getModule();
            logger.info((0, util_1.inspect)(mdl, false, null, true));
        }
    }
};
// Registering yargs configuration.
// tslint:disable-next-line:no-unused-expression
yargs_1.default
    .version(false)
    .scriptName('')
    .command(initCommand)
    .command(generateCommand)
    .command(validateCommand)
    .command(latestForgeCommand)
    .command(recommendedForgeCommand)
    .command(testCommand)
    .demandCommand()
    .help()
    .argv;
//# sourceMappingURL=index.js.map