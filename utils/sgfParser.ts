export interface SGFNode {
  properties: { [key: string]: string[] };
  children: SGFNode[];
  parent?: SGFNode;
}

export const parseSGFToTree = (sgf: string): SGFNode[] => {
  const rootNodes: SGFNode[] = [];
  let current: SGFNode | null = null;
  let stack: SGFNode[] = [];
  let i = 0;

  while (i < sgf.length) {
    const char = sgf[i];

    if (char === '(') {
      // Start of a variation (or root)
      if (current) {
        stack.push(current);
      }
      i++;
    } else if (char === ';') {
      // New Node
      const newNode: SGFNode = { properties: {}, children: [] };
      if (current) {
        newNode.parent = current;
        current.children.push(newNode);
      } else {
        // If stack matches logic, this might be a variation of parent
         if (stack.length > 0) {
             const parent = stack[stack.length - 1];
             newNode.parent = parent;
             parent.children.push(newNode);
         } else {
             rootNodes.push(newNode);
         }
      }
      current = newNode;
      i++;
    } else if (char === ')') {
      // End of variation
      if (stack.length > 0) {
        current = stack.pop() || null;
      } else {
        current = null;
      }
      i++;
    } else if (char >= 'A' && char <= 'Z') {
      // Property parsing
      let propIdent = "";
      while (i < sgf.length && sgf[i] >= 'A' && sgf[i] <= 'Z') {
        propIdent += sgf[i];
        i++;
      }

      // Read values [val]
      const values: string[] = [];
      while (i < sgf.length) {
          // Skip whitespace between Ident and Value or between Values
          while (i < sgf.length && /\s/.test(sgf[i])) i++;
          
          if (sgf[i] === '[') {
              let val = "";
              i++; // skip [
              while (i < sgf.length && sgf[i] !== ']') {
                  if (sgf[i] === '\\') { // Escape char
                      i++;
                  }
                  val += sgf[i];
                  i++;
              }
              values.push(val);
              i++; // skip ]
          } else {
              break; 
          }
      }
      
      if (current) {
          current.properties[propIdent] = values;
      }
    } else {
      i++;
    }
  }

  return rootNodes;
};
