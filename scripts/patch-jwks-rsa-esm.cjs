'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = require.resolve('jwks-rsa/package.json');
const packageRoot = path.dirname(packageJsonPath);
const packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageInfo.version !== '4.1.0') {
  throw new Error(
    `Refusing to patch unexpected jwks-rsa ${packageInfo.version}; inspect the package before updating this compatibility patch.`,
  );
}
const utilsPath = path.join(packageRoot, 'src', 'utils.js');
const passportPath = path.join(packageRoot, 'src', 'integrations', 'passport.js');
const josePath = path.join(packageRoot, 'src', 'jose.js');
let utilsSource = fs.readFileSync(utilsPath, 'utf8');
let passportSource = fs.readFileSync(passportPath, 'utf8');

const cjsJoseImport = "const jose = require('jose');";
const utilsJoseImport = "const { getJose } = require('./jose');";
const passportJoseImport = "const { getJose } = require('../jose');";
const utilsFunction = 'async function retrieveSigningKeys(jwks) {';
const passportHandler = `  return function secretProvider(req, rawJwtToken, cb) {
    let decoded;
    try {
      decoded = {
        payload: jose.decodeJwt(rawJwtToken),
        header: jose.decodeProtectedHeader(rawJwtToken)
      };
    } catch (err) {
      decoded = null;
    }

    if (!decoded || !supportedAlg.includes(decoded.header.alg)) {
      return cb(null, null);
    }

    client.getSigningKey(decoded.header.kid)
      .then(key => {
        cb(null, key.publicKey || key.rsaPublicKey);
      }).catch(err => {
        onError(err, (newError) => cb(newError, null));
      });
  };`;
const lazyPassportHandler = `  return function secretProvider(req, rawJwtToken, cb) {
    getJose()
      .then(jose => {
        let decoded;
        try {
          decoded = {
            payload: jose.decodeJwt(rawJwtToken),
            header: jose.decodeProtectedHeader(rawJwtToken)
          };
        } catch (err) {
          decoded = null;
        }

        if (!decoded || !supportedAlg.includes(decoded.header.alg)) {
          return cb(null, null);
        }

        client.getSigningKey(decoded.header.kid)
          .then(key => {
            cb(null, key.publicKey || key.rsaPublicKey);
          }).catch(err => {
            onError(err, (newError) => cb(newError, null));
          });
      }).catch(err => {
        cb(err, null);
      });
  };`;
const helperIsValid = fs.existsSync(josePath)
  && fs.readFileSync(josePath, 'utf8').includes("return import(specifier)");

if (!utilsSource.includes(cjsJoseImport) && !passportSource.includes(cjsJoseImport)) {
  if (utilsSource.includes('getJose') && passportSource.includes('getJose') && helperIsValid) {
    if (utilsSource.includes("require('../jose')")) {
      utilsSource = utilsSource.replace("require('../jose')", "require('./jose')");
      fs.writeFileSync(utilsPath, utilsSource);
    }
    if (!utilsSource.includes("require('./jose')") || !passportSource.includes("require('../jose')")) {
      throw new Error(`The existing jwks-rsa jose loader has unexpected relative imports (${utilsPath}, ${passportPath}).`);
    }
    console.log(`jwks-rsa ${packageInfo.version} already uses a lazy ESM-compatible jose loader.`);
    process.exit(0);
  }
  throw new Error(
    `Unsupported jwks-rsa ${packageInfo.version}: no recognized CJS import to patch and no known lazy jose loader.`,
  );
}

if (!fs.existsSync(josePath)) {
  fs.writeFileSync(josePath, `'use strict';\n\nlet jose;\nconst dynamicImport = new Function('specifier', 'return import(specifier)');\n\nfunction getJose() {\n  if (!jose) {\n    jose = dynamicImport('jose');\n  }\n\n  return jose;\n}\n\nmodule.exports = {\n  getJose\n};\n`);
} else if (!helperIsValid) {
  throw new Error(`Refusing to overwrite an unexpected jose loader at ${josePath}.`);
}

if (utilsSource.includes(cjsJoseImport)) {
  if (!utilsSource.includes(`${utilsFunction}\n`)) {
    throw new Error(`Could not find the expected retrieveSigningKeys function in ${utilsPath}.`);
  }
  utilsSource = utilsSource.replace(`${cjsJoseImport}\n`, `${utilsJoseImport}\n`);
  utilsSource = utilsSource.replace(`${utilsFunction}\n`, `${utilsFunction}\n  const jose = await getJose();\n`);
  fs.writeFileSync(utilsPath, utilsSource);
}

if (passportSource.includes(cjsJoseImport)) {
  if (!passportSource.includes(passportHandler)) {
    throw new Error(`Could not find the expected Passport secretProvider in ${passportPath}.`);
  }
  passportSource = passportSource.replace(cjsJoseImport, passportJoseImport);
  passportSource = passportSource.replace(passportHandler, lazyPassportHandler);
  fs.writeFileSync(passportPath, passportSource);
}

if (utilsSource.includes(cjsJoseImport) || !utilsSource.includes("require('./jose')")) {
  throw new Error(`The jwks-rsa jose patch was incomplete for ${utilsPath}.`);
}
if (passportSource.includes(cjsJoseImport) || !passportSource.includes("require('../jose')")) {
  throw new Error(`The jwks-rsa jose patch was incomplete for ${passportPath}.`);
}

console.log(`Patched jwks-rsa ${packageInfo.version} to load ESM-only jose lazily with native import().`);
