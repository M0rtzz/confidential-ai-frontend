import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'umi';

import { routes } from './routes';

const sharedEnvPath = path.resolve(
  __dirname,
  '../../../../data-sandbox-package/data-sandbox.env',
);
dotenv.config({ path: process.env.DATA_SANDBOX_ENV_FILE || sharedEnvPath });
const localEnv = dotenv.config().parsed || {};
const env = { ...process.env, ...localEnv };

let proxyOptions;
try {
  const config = env;
  if (!config || !config?.PROXY_URL) {
    throw new Error();
  }
  proxyOptions = {
    proxy: {
      '/api': {
        target: config?.PROXY_URL,
        changeOrigin: true,
      },
    },
  };
} catch (e) {
  console.warn('如果在本地开发，需要做api代理，可以手动在platform目录下增加.env文件');
  console.warn('文件内容为：');
  console.warn(`
      PROXY_URL = http(s)://xxxxxx
  `);
}

export default defineConfig({
  routes,
  npmClient: 'pnpm',
  // https: {},
  svgr: {},
  title: 'HUSTNLP 密态计算',
  favicons: ['/favicon.ico'],
  extraBabelPlugins: [
    'babel-plugin-transform-typescript-metadata',
    'babel-plugin-parameter-decorator',
  ],
  mfsu: false,
  // Route chunks otherwise keep stable names such as p__edge.async.js. After
  // an upgrade, a browser can combine a cached chunk with the new runtime and
  // fail in webpack's module loader. Content hashes make each build immutable.
  hash: true,
  define: Object.fromEntries(
    [
      'DB_MYSQL55_PORT',
      'DB_MYSQL80_PORT',
      'DB_POSTGRES_PORT',
      'DB_GREATSQL_PORT',
      'DB_OPENGAUSS_PORT',
      'DB_MYSQL55_DATABASE',
      'DB_MYSQL80_DATABASE',
      'DB_POSTGRES_DATABASE',
      'DB_GREATSQL_DATABASE',
      'DB_OPENGAUSS_DATABASE',
      'DB_MYSQL55_USER',
      'DB_MYSQL80_USER',
      'DB_POSTGRES_USER',
      'DB_GREATSQL_USER',
      'DB_OPENGAUSS_USER',
      'DB_MYSQL55_PASSWORD',
      'DB_MYSQL80_PASSWORD',
      'DB_POSTGRES_PASSWORD',
      'DB_GREATSQL_PASSWORD',
      'DB_OPENGAUSS_PASSWORD',
    ].map((key) => [`process.env.${key}`, env[key] || '']),
  ),
  codeSplitting: {
    jsStrategy: 'granularChunks',
  },
  // oneApi: {
  //   apps: [
  //     {
  //       name: 'secretpad', // 后端应用名
  //       tag: 'feature/0.9.0b0_merge', // 分支 tag
  //       source: 'ZAPPINFO', // 应用来源，默认 ZAPPINFO，其他来源可在官网的应用信息中查看
  //     },
  //   ],
  //   typescript: true, // 每个接口的类型定义，自动生成，默认 false
  // },
  esbuildMinifyIIFE: true,
  ...proxyOptions,
});
