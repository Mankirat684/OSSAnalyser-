import Parser, { Language } from 'web-tree-sitter'
import path from 'path'

let isInitialized = false;
let javascript : Parser.Language;
let typescript : Parser.Language;
let TSX : Parser.Language;

export async function initTreeSitter(){
    if(isInitialized) return;
    await Parser.init()
    javascript = await Language.load(
        path.join(process.cwd(),'wasm','tree-sitter-javascript.wasm')
    )
    typescript = await Language.load(
        path.join(process.cwd(),'wasm','tree-sitter-typescript.wasm')
    )
    TSX = await Language.load(
        path.join(process.cwd(),'wasm','tree-sitter-tsx.wasm')
    )
    isInitialized = true;
}

export function getParser(extension : string): Parser{
    if(!isInitialized) throw new Error("Parser is not initaialized");

    const parser = new Parser();
    switch(extension){
        case '.ts': {
            parser.setLanguage(typescript);
            break;
        }
        case '.js' :
        case '.mjs':
        case '.cjs': {
            parser.setLanguage(javascript);
            break;
        }
        case '.tsx': {
            parser.setLanguage(TSX);
            break;
        }
        default:{
            throw new Error(`unsupported Extension ${extension}`);
        }
    }
    return parser;
}
