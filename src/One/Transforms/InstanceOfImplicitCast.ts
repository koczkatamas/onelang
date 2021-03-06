import { AstTransformer } from "../AstTransformer";
import { InstanceOfExpression, BinaryExpression, Expression, CastExpression, ConditionalExpression, PropertyAccessExpression } from "../Ast/Expressions";
import { Statement, IfStatement, WhileStatement } from "../Ast/Statements";
import { ForeachVariableReference, VariableDeclarationReference, MethodParameterReference, InstanceFieldReference, ThisReference, Reference, StaticThisReference } from "../Ast/References";
import { ArrayHelper } from "../../Utils/ArrayHelper";

/**
 * Converts "expr instanceof Type && expr.something" to "expr instanceof Type && ((Type)expr).something".
 * Also handles cases: 
 *   - "if/while (expr instanceof Type) { ... every expr is converted to ((Type)expr) here ... }
 *   - "expr instanceof Type ? ((Type)expr) : expr" (note: expr is not a Type in the false/else branch)
 * Expr can also be simple property access expressions, so "obj.prop instanceof Type && ((Type)obj.prop).typeProp" also converted.
 */
export class InstanceOfImplicitCast extends AstTransformer {
    casts: InstanceOfExpression[] = [];
    castCounts: number[] = [];

    constructor() { super("InstanceOfImplicitCast"); }

    protected addCast(cast: InstanceOfExpression) {
        if (this.castCounts.length > 0) {
            cast.implicitCasts = [];
            this.casts.push(cast);
            const last = this.castCounts.length - 1;
            this.castCounts[last] = this.castCounts[last] + 1;
        }
    }

    protected pushContext() {
        this.castCounts.push(0);
    }

    protected popContext() {
        const castCount = this.castCounts.pop();
        if (castCount !== 0)
            ArrayHelper.removeLastN(this.casts, castCount);
    }

    protected equals(expr1: Expression, expr2: Expression): boolean {
        // implicit casts don't matter when checking equality...
        while (expr1 instanceof CastExpression && expr1.instanceOfCast !== null)
            expr1 = expr1.expression;
        while (expr2 instanceof CastExpression && expr2.instanceOfCast !== null)
            expr2 = expr2.expression;
        
        // MetP, V, MethP.PA, V.PA, MethP/V [ {FEVR} ], FEVR
        if (expr1 instanceof PropertyAccessExpression)
            return expr2 instanceof PropertyAccessExpression && expr1.propertyName === expr2.propertyName && this.equals(expr1.object, expr2.object);
        else if (expr1 instanceof VariableDeclarationReference)
            return expr2 instanceof VariableDeclarationReference && expr1.decl === expr2.decl;
        else if (expr1 instanceof MethodParameterReference)
            return expr2 instanceof MethodParameterReference && expr1.decl === expr2.decl;
        else if (expr1 instanceof ForeachVariableReference)
            return expr2 instanceof ForeachVariableReference && expr1.decl === expr2.decl;
        else if (expr1 instanceof InstanceFieldReference)
            return expr2 instanceof InstanceFieldReference && expr1.field === expr2.field;
        else if (expr1 instanceof ThisReference)
            return expr2 instanceof ThisReference;
        else if (expr1 instanceof StaticThisReference)
            return expr2 instanceof StaticThisReference;
        return false;
    }
    
    protected visitExpression(expr: Expression): Expression {
        let result: Expression = expr;
        if (expr instanceof InstanceOfExpression) {
            this.visitExpression(expr.expr);
            this.addCast(expr);
        } else if (expr instanceof BinaryExpression && expr.operator === "&&") {
            expr.left = this.visitExpression(expr.left);
            expr.right = this.visitExpression(expr.right);
        } else if (expr instanceof ConditionalExpression) {
            this.pushContext();
            expr.condition = this.visitExpression(expr.condition);
            expr.whenTrue = this.visitExpression(expr.whenTrue);
            this.popContext();

            expr.whenFalse = this.visitExpression(expr.whenFalse);
        } else if (expr instanceof Reference && expr.parentNode instanceof BinaryExpression && expr.parentNode.operator === "=" && expr.parentNode.left === expr) {
            // we should not cast the left-side of an assignment operator
        } else {
            this.pushContext();
            result = super.visitExpression(expr);
            this.popContext();
            // @java final var result2 = result;
            const result2 = result;
            const match = this.casts.find(cast => this.equals(result2, cast.expr)) || null;
            if (match !== null) {
                const castExpr = new CastExpression(match.checkType, result);
                castExpr.instanceOfCast = match;
                match.implicitCasts.push(castExpr);
                result = castExpr;
            }
        }
        return result;
    }

    protected visitStatement(stmt: Statement): Statement { 
        this.currentStatement = stmt;

        if (stmt instanceof IfStatement) {
            this.pushContext();
            stmt.condition = this.visitExpression(stmt.condition);
            this.visitBlock(stmt.then);
            this.popContext();

            if (stmt.else_ !== null)
                this.visitBlock(stmt.else_);
        } else if (stmt instanceof WhileStatement) {
            this.pushContext();
            stmt.condition = this.visitExpression(stmt.condition);
            this.visitBlock(stmt.body);
            this.popContext();
        } else {
            this.pushContext();
            super.visitStatement(stmt);
            this.popContext();
        }

        return stmt;
    }
}