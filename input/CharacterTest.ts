class TestClass {
    testMethod() {
        const str = "a1A";
        for (var i = 0; i < str.length; i++) {
            const c = str[i];
            const isUpper = "A" <= c && c <= "Z";
            const isLower = "a" <= c && c <= "z";
            const isNumber = "0" <= c && c <= "9";
            console.log(isUpper ? "upper" : isLower ? "lower" : isNumber ? "number" : "other");
        }
    }
}
