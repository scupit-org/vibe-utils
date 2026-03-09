import "tsx/esm";
import pluginWebc from "@11ty/eleventy-plugin-webc";
import { RenderPlugin } from "@11ty/eleventy";
import { renderToStaticMarkup } from "react-dom/server";

import esbuild from "esbuild";

import path from "node:path";
import * as sass from "sass";

// https://www.11ty.dev/docs/config/
export default async function (eleventyConfig) {
  // https://www.11ty.dev/docs/config/
  eleventyConfig.setInputDirectory("src");

  // https://www.11ty.dev/docs/copy/
  eleventyConfig.addPassthroughCopy("assets");

  // https://www.11ty.dev/docs/languages/webc/
  eleventyConfig.addPlugin(pluginWebc, {
    components: "src/_components/**/*.webc",
    // https://www.11ty.dev/docs/languages/webc/#post-process-html-output-as-web-c
    // Essentially, this post-processes any HTML output using webc, turning any components it encounters into raw HTML.
    useTransform: true
  });

  // https://www.11ty.dev/docs/plugins/render/
  eleventyConfig.addPlugin(RenderPlugin);

  eleventyConfig.addTemplateFormats("11ty.ts,11ty.tsx");
  eleventyConfig.addExtension(["11ty.jsx", "11ty.ts", "11ty.tsx"], {
    key: "11ty.js",
    compile: function () {
      return async function (data) {
        let content = await this.defaultRenderer(data);
        return renderToStaticMarkup(content);
      };
    },
  });

  // https://www.11ty.dev/docs/languages/sass/
  eleventyConfig.addTemplateFormats("scss");
  eleventyConfig.addExtension("scss", {
		outputFileExtension: "css",

		// opt-out of Eleventy Layouts
		useLayouts: false,

		compile: async function (inputContent, inputPath) {
			let parsed = path.parse(inputPath);
			// Don’t compile file names that start with an underscore
			if(parsed.name.startsWith("_")) {
				return;
			}

			let result = await sass.compileStringAsync(inputContent, {
				loadPaths: [
					parsed.dir || ".",
					this.config.dir.includes,
				]
			});

			// Map dependencies for incremental builds
			this.addDependencies(inputPath, result.loadedUrls);

			return async (data) => {
				return result.css;
			};
		},
	});

  eleventyConfig.addTemplateFormats("ts");
  eleventyConfig.addExtension("ts", {
    outputFileExtension: "js",
    useLayouts: false,
    compile: async function (_inputContent, inputPath) {
      await esbuild.build({
        bundle: true,
        entryPoints: [inputPath],
        // TODO: Make this mirror the directory structure somehow, like the others do.
        // Sadly, we can't just return the contents because we also want source maps sometimes.
        outdir: `${this.config.dir.output}/js`,
        minify: true,
        sourcemap: true
      })
    }
  })
}
