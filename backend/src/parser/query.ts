/**
 * Captures every function-like construct we care about for the dependency graph:
 *   - top-level function declarations
 *   - class methods (incl. static/async/getters/setters, but only ones with a body)
 *   - const/let foo = (...) => {}  and  const foo = function() {}
 *   - object literal methods:  { foo() {}, bar: () => {} }
 *
 * @func is always the outermost node worth treating as "the function".
 * @name is the identifier we use for the human-readable name.
 * Works for javascript, typescript, and tsx grammars (node type names are shared).
 */
export const FUNCTION_QUERY = `
(function_declaration
  name: (identifier) @name) @func

(method_definition
  name: (property_identifier) @name
  body: (statement_block)) @func

(variable_declarator
  name: (identifier) @name
  value: (arrow_function)) @func

(variable_declarator
  name: (identifier) @name
  value: (function_expression)) @func

(pair
  key: (property_identifier) @name
  value: (arrow_function)) @func

(pair
  key: (property_identifier) @name
  value: (function_expression)) @func
`;

/**
 * Call expressions inside a function body — used in the next pass to build
 * edges between FunctionNodes. Kept here since it reuses the same query object.
 */
export const CALL_QUERY = `
(call_expression
  function: (identifier) @callee) @call

(call_expression
  function: (member_expression
    property: (property_identifier) @callee)) @call
`;