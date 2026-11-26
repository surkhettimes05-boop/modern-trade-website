const ts = require('typescript');

// Coverage-only transformation of runtime entry points. Normal tests retain ts-jest.
// Production Node and Worker type checking remains separate and mandatory.
module.exports = {
  process(source, filename, options) {
    if (!options.instrument) {
      throw new Error(`Runtime entry point must be tested in its own runtime: ${filename}`);
    }
    const result = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        sourceMap: true,
        inlineSources: true,
      },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => process.cwd(), getCanonicalFileName: f => f, getNewLine: () => '\n',
    }));
    return { code: result.outputText, map: result.sourceMapText };
  },
};
