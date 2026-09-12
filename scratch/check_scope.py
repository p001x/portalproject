import os
import ast

gee_dir = r"c:\Users\user\Documents\blacportal\backend\gee"
exclude = ["rusle.py"]

def find_missing_dynamic_scale(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        source = f.read()

    # Parse into AST
    tree = ast.parse(source)

    class ScopeAnalyzer(ast.NodeVisitor):
        def __init__(self):
            self.errors = []
            self.current_func = None
            self.defined_in_func = set()
            self.used_in_func = set()

        def visit_FunctionDef(self, node):
            old_func = self.current_func
            self.current_func = node.name
            
            # We must check scope
            defined_here = False
            used_here = False
            
            for child in ast.walk(node):
                if isinstance(child, ast.Assign):
                    for target in child.targets:
                        if isinstance(target, ast.Name) and target.id == 'dynamic_scale':
                            defined_here = True
                if isinstance(child, ast.Name) and child.id == 'dynamic_scale' and isinstance(child.ctx, ast.Load):
                    used_here = True
            
            if used_here and not defined_here:
                self.errors.append(node.name)

            self.generic_visit(node)
            self.current_func = old_func

    analyzer = ScopeAnalyzer()
    analyzer.visit(tree)
    if analyzer.errors:
        print(f"{os.path.basename(filepath)}: Missing dynamic_scale in {analyzer.errors}")

for file in os.listdir(gee_dir):
    if file.endswith(".py") and file not in exclude:
        find_missing_dynamic_scale(os.path.join(gee_dir, file))
