import fs from 'fs/promises';
import path from 'path';
import {getParser} from '../config/treesitter.js'
import Parser from 'web-tree-sitter';
export interface extractedCode{
    name : string,
    filePath : string,
    type : 'function' | 'class' | 'method',
    dependencies: string[],
    rawCode: string
}


