import { InferTypesPlugin } from "./Helpers/InferTypesPlugin";
import { Expression, ArrayLiteral, MapLiteral, CastExpression, BinaryExpression, ConditionalExpression } from "../../Ast/Expressions";
import { ClassType, AnyType, TypeHelper } from "../../Ast/AstTypes";
import { IType } from "../../Ast/Interfaces";

export class ArrayAndMapLiteralTypeInfer extends InferTypesPlugin {
    constructor() { super("ArrayAndMapLiteralTypeInfer"); }

    protected inferArrayOrMapItemType(items: Expression[], expectedType: IType, isMap: boolean) {
        const itemTypes: IType[] = [];
        for (const item of items)
            if (!itemTypes.some(t => TypeHelper.equals(t, item.getType())))
                itemTypes.push(item.getType());

        const literalType = isMap ? this.main.currentFile.literalTypes.map : this.main.currentFile.literalTypes.array;

        let itemType: IType = null;
        if (itemTypes.length === 0) {
            if (expectedType === null) {
                this.errorMan.warn(`Could not determine the type of an empty ${isMap ? "MapLiteral" : "ArrayLiteral"}, using AnyType instead`);
                itemType = AnyType.instance;
            } else if (expectedType instanceof ClassType && expectedType.decl === literalType.decl) {
                itemType = expectedType.typeArguments[0];
            } else {
                itemType = AnyType.instance;
            }
        } else if (itemTypes.length === 1) {
            itemType = itemTypes[0];
        } else if (!(expectedType instanceof AnyType)) {
            this.errorMan.warn(`Could not determine the type of ${isMap ? "a MapLiteral" : "an ArrayLiteral"}! Multiple types were found: ${itemTypes.map(x => x.repr()).join(", ")}, using AnyType instead`);
            itemType = AnyType.instance;
        }
        return itemType;
    }

    canDetectType(expr: Expression) { return expr instanceof ArrayLiteral || expr instanceof MapLiteral; }

    detectType(expr: Expression) {
        if (expr.expectedType === null) {
            // make this work: `<{ [name: string]: SomeObject }> {}`
            if (expr.parentNode instanceof CastExpression)
                expr.setExpectedType(expr.parentNode.newType);
            // make this work: `let someMap: { [name: string]: SomeObject } = {};`
            else if (expr.parentNode instanceof BinaryExpression && expr.parentNode.operator === "=" && expr.parentNode.right === expr)
                expr.setExpectedType(expr.parentNode.left.actualType);
            else if (expr.parentNode instanceof ConditionalExpression && (expr.parentNode.whenTrue === expr || expr.parentNode.whenFalse === expr))
                expr.setExpectedType(expr.parentNode.whenTrue === expr ? expr.parentNode.whenFalse.actualType : expr.parentNode.whenTrue.actualType);
        }

        if (expr instanceof ArrayLiteral) {
            const itemType = this.inferArrayOrMapItemType(expr.items, expr.expectedType, false);
            expr.setActualType(new ClassType(this.main.currentFile.literalTypes.array.decl, [itemType]));
        } else if (expr instanceof MapLiteral) {
            const itemType = this.inferArrayOrMapItemType(expr.items.map(x => x.value), expr.expectedType, true);
            expr.setActualType(new ClassType(this.main.currentFile.literalTypes.map.decl, [itemType]));
        }

        return true;
    }
}