import { generateService, getSchema } from '@umijs/openapi';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import rimraf from 'rimraf';
import serveStatic from 'serve-static';
import type { IApi } from 'umi';
import { lodash, winPath } from 'umi/plugin-utils';

export default (api: IApi) => {
  api.onStart(() => {
    console.log('Using openapi Plugin');
  });
  api.describe({
    key: 'openAPI',
    config: {
      schema(joi) {
        const itemSchema = joi.object({
          requestLibPath: joi.string(),
          schemaPath: joi.string(),
          mock: joi.boolean(),
          projectName: joi.string(),
          apiPrefix: joi.alternatives(joi.string(), joi.function()),
          namespace: joi.string(),
          hook: joi.object({
            customFunctionName: joi.function(),
            customClassName: joi.function(),
          }),
          enumStyle: joi.string(),
        });
        return joi.alternatives(joi.array().items(itemSchema), itemSchema);
      },
    },
    enableBy: api.EnableBy.config,
  });
  const { absNodeModulesPath, absTmpPath } = api.paths;
  const openAPIFilesPath = join(absNodeModulesPath!, 'umi_open_api');

  try {
    if (existsSync(openAPIFilesPath)) {
      rimraf.sync(openAPIFilesPath);
    }
    mkdirSync(join(openAPIFilesPath));
  } catch (error) {
    // console.log(error);
  }

  // 增加中间件
  api.addBeforeMiddlewares(() => {
    return [serveStatic(openAPIFilesPath)];
  });

  api.onGenerateFiles(() => {
    if (api.env !== 'development') return;
    const openAPIConfig = api.config.openAPI;
    const arrayConfig = lodash.flatten([openAPIConfig]);
    const config = arrayConfig?.[0]?.projectName || 'openapi';
    api.writeTmpFile({
      path: join('plugin-openapi', 'openapi.tsx'),
      noPluginDir: true,
      content: `
      // This file is generated by Umi automatically
      // DO NOT CHANGE IT MANUALLY!
      import { useEffect, useState } from 'react';
      import { SwaggerUIBundle } from 'swagger-ui-dist';
      import 'swagger-ui-dist/swagger-ui.css';
      const App = () => {
        const [value, setValue] = useState("${config || 'openapi'}" );
        useEffect(() => {
          SwaggerUIBundle({
            url: \`/umi-plugins_$\{value}.json\`,
            dom_id: '#swagger-ui',
          });
        }, [value]);

        return (
          <div
            style={{
              padding: 24,
            }}
          >
            <select
              style={{
                position: "fixed",
                right: "16px",
                top: "8px",
              }}
              onChange={(e) => setValue(e.target.value)}
            >
              ${arrayConfig
          .map((item) => {
            return `<option value="${item.projectName || 'openapi'}">${item.projectName || 'openapi'
              }</option>`;
          })
          .join('\n')}
            </select>
            <div id="swagger-ui" />
          </div>
        );
      };
      export default App;
`,
    });
  });

  if (api.env === 'development') {
    api.modifyRoutes((routes) => {
      routes['umi/plugin/openapi'] = {
        path: '/umi/plugin/openapi',
        absPath: '/umi/plugin/openapi',
        id: 'umi/plugin/openapi',
        file: winPath(join(absTmpPath!, 'plugin-openapi', 'openapi.tsx')),
      };
      return routes;
    });
  }

  const genOpenAPIFiles = async (openAPIConfig: any) => {
    if (api.env !== 'development') return;
    const openAPIJson = await getSchema(openAPIConfig.schemaPath);
    writeFileSync(
      join(
        openAPIFilesPath,
        `umi-plugins_${openAPIConfig.projectName || 'openapi'}.json`,
      ),
      JSON.stringify(openAPIJson, null, 2),
    );
  };
  api.onDevCompileDone(async () => {
    if (api.env !== 'development') return;
    try {
      const openAPIConfig = api.config.openAPI;
      if (Array.isArray(openAPIConfig)) {
        openAPIConfig.map((item) => genOpenAPIFiles(item));
        return;
      }
      genOpenAPIFiles(openAPIConfig);
    } catch (error) {
      console.error(error);
    }
  });
  const genAllFiles = async (openAPIConfig: any) => {
    const pageConfig = require(join(api.cwd, 'package.json'));
    const mockFolder = openAPIConfig.mock ? join(api.cwd, 'mock') : undefined;
    const serversFolder = join(api.cwd, 'src', 'services');
    // 如果mock 文件不存在，创建一下
    if (mockFolder && !existsSync(mockFolder)) {
      mkdirSync(mockFolder);
    }
    // 如果mock 文件不存在，创建一下
    if (serversFolder && !existsSync(serversFolder)) {
      mkdirSync(serversFolder);
    }

    await generateService({
      projectName: pageConfig.name.split('/').pop(),
      ...openAPIConfig,
      serversPath: serversFolder,
      mockFolder,
    });
    api.logger.info('[openAPI]: execution complete');
  };
  api.registerCommand({
    name: 'openapi',
    fn: async () => {
      const openAPIConfig = api.config.openAPI;
      if (Array.isArray(openAPIConfig)) {
        openAPIConfig.map((item) => genAllFiles(item));
        return;
      }
      // TODO: 用户没有 src/services 会报错
      genAllFiles(openAPIConfig);
    },
  });
};
