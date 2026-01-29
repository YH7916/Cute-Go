export interface SGFNode {
  properties: { [key: string]: string[] };
  children: SGFNode[];
  parent?: SGFNode;
}

export const parseSGFToTree = (sgf: string): SGFNode[] => {
  const rootNodes: SGFNode[] = [];
  let i = 0;

  // Helper to skip whitespace
  const skipSpace = () => {
    while (i < sgf.length && /\s/.test(sgf[i])) i++;
  };

  const parseNode = (parent: SGFNode | null): SGFNode | null => {
      if (i >= sgf.length || sgf[i] !== ';') return null;
      i++; // consume ';'

      const node: SGFNode = { properties: {}, children: [], parent: parent || undefined };
      if (parent) parent.children.push(node);
      else rootNodes.push(node); // If no parent, it's a root (at least effectively)

      // Parse Properties
      while (i < sgf.length) {
          skipSpace();
          
          if (i < sgf.length && sgf[i] >= 'A' && sgf[i] <= 'Z') {
              let ident = "";
              while (i < sgf.length && sgf[i] >= 'A' && sgf[i] <= 'Z') {
                  ident += sgf[i];
                  i++;
              }
              
              skipSpace();
              const values: string[] = [];
              
              // Properties must have values in [...]
              while (i < sgf.length && sgf[i] === '[') {
                  i++; // skip [
                  let val = "";
                  while (i < sgf.length && sgf[i] !== ']') {
                      if (sgf[i] === '\\') { i++; } // Unescape next char
                      if (i < sgf.length) val += sgf[i];
                      i++;
                  }
                  values.push(val);
                  if (i < sgf.length) i++; // skip ]
                  skipSpace();
              }
              
              if (values.length > 0) node.properties[ident] = values;
          } else {
              // Not a property identifier, stop parsing properties for this node
              break;
          }
      }
      return node;
  };

  // Parses a Sequence: Node { Node }
  // Returns the last node in the sequence
  const parseSequence = (parent: SGFNode | null): SGFNode | null => {
      let current = parent;
      while (i < sgf.length) {
          skipSpace();
          if (sgf[i] === ';') {
              const node = parseNode(current);
              if (node) current = node;
          } else {
              break;
          }
      }
      return current;
  };

  // Parses a GameTree: '(' Sequence { GameTree } ')'
  const parseGameTree = (parent: SGFNode | null) => {
      skipSpace();
      if (i >= sgf.length || sgf[i] !== '(') return;
      i++; // consume '('
      
      const lastNode = parseSequence(parent);
      
      // Variations (Child GameTrees)
      while (i < sgf.length) {
          skipSpace();
          if (sgf[i] === '(') {
              parseGameTree(lastNode);
          } else {
              break;
          }
      }
      
      skipSpace();
      if (i < sgf.length && sgf[i] === ')') i++; // consume ')'
  };

  // Entry Point: Collection = { GameTree }
  while (i < sgf.length) {
      skipSpace();
      if (sgf[i] === '(') {
          parseGameTree(null);
      } else {
          i++; // Skip unknown garbage
      }
  }

  return rootNodes;
};
