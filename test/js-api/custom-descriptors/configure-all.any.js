// META: global=window,dedicatedworker,jsshell
// META: script=/wasm/jsapi/wasm-module-builder.js

function addConfigureAll(builder) {
  builder.$prototypesTypeIndex = builder.addArray(kWasmExternRef, true, kNoSuperType, true);
  builder.$methodsTypeIndex = builder.addArray(kWasmFuncRef, true, kNoSuperType, true);
  builder.$dataTypeIndex = builder.addArray(kWasmI8, true, kNoSuperType, true);
  builder.$configureAllTypeIndex = builder.addType({
    params: [wasmRefNullType(builder.$prototypesTypeIndex),
             wasmRefNullType(builder.$methodsTypeIndex),
             wasmRefNullType(builder.$dataTypeIndex),
             kWasmExternRef],
    results: []
  });
  builder.$configureAllFuncIndex = builder.addImport("wasm:js-prototypes",
                                                  "configureAll",
                                                  builder.$configureAllTypeIndex);
}

function asWasmFunction(f, sig) {
  const builder = new WasmModuleBuilder();
  const importIndex = builder.addImport("f", "f", sig);
  builder.addExport("f", importIndex);
  return builder.instantiate({ f: { f } }).exports.f;
}

let stringToBytes;

let makeProtosArray;
let makeMethodsArray;
let makeDataArray;
let configureAll;

let makeStructWithProto;
let getStructCount;
let setStructCount;

setup(() => {
  // Export configureAll and the utility functions we will use in these tests.
  const builder = new WasmModuleBuilder();
  addConfigureAll(builder);

  const refPrototypes = wasmRefNullType(builder.$prototypesTypeIndex);
  const refMethods = wasmRefNullType(builder.$methodsTypeIndex);
  const refData = wasmRefNullType(builder.$dataTypeIndex);

  builder.startRecGroup();
  const descTypeIndex = builder.nextTypeIndex() + 1;
  const structTypeIndex = builder.addStruct({
    descriptor: descTypeIndex,
    fields: [makeField(kWasmI32, true)],
  });
  builder.addStruct({
    describes: structTypeIndex,
    fields: [makeField(kWasmExternRef, false)],
  });
  builder.endRecGroup();

  const refStruct = wasmRefNullType(structTypeIndex);

  builder
    .addFunction("makeProtosArray", makeSig([kWasmI32], [refPrototypes]))
    .addBody([
      kExprLocalGet, 0,
      ...GCInstr(kExprArrayNewDefault), builder.$prototypesTypeIndex,
    ])
    .exportFunc();

  builder
    .addFunction("setProto", makeSig([refPrototypes, kWasmI32, kWasmExternRef], []))
    .addBody([
      kExprLocalGet, 0,
      kExprLocalGet, 1,
      kExprLocalGet, 2,
      ...GCInstr(kExprArraySet), builder.$prototypesTypeIndex,
    ])
    .exportFunc();

  builder
    .addFunction("makeMethodsArray", makeSig([kWasmI32], [refMethods]))
    .addBody([
      kExprLocalGet, 0,
      ...GCInstr(kExprArrayNewDefault), builder.$methodsTypeIndex,
    ])
    .exportFunc();

  builder
    .addFunction("setMethod", makeSig([refMethods, kWasmI32, kWasmFuncRef], []))
    .addBody([
      kExprLocalGet, 0,
      kExprLocalGet, 1,
      kExprLocalGet, 2,
      ...GCInstr(kExprArraySet), builder.$methodsTypeIndex,
    ])
    .exportFunc();

  builder
    .addFunction("makeDataArray", makeSig([kWasmI32], [refData]))
    .addBody([
      kExprLocalGet, 0,
      ...GCInstr(kExprArrayNewDefault), builder.$dataTypeIndex,
    ])
    .exportFunc();

  builder
    .addFunction("setData", makeSig([refData, kWasmI32, kWasmI32], []))
    .addBody([
      kExprLocalGet, 0,
      kExprLocalGet, 1,
      kExprLocalGet, 2,
      ...GCInstr(kExprArraySet), builder.$dataTypeIndex
    ])
    .exportFunc();

  builder.addExport("configureAll", builder.$configureAllFuncIndex);

  builder
    .addFunction("makeStructWithProto", makeSig([kWasmExternRef], [refStruct]))
    .addBody([
      kExprLocalGet, 0,
      ...GCInstr(kExprStructNew), descTypeIndex,
      ...GCInstr(kExprStructNewDefaultDesc), structTypeIndex,
    ])
    .exportFunc();

  builder
    .addFunction("getStructCount", makeSig([refStruct], [kWasmI32]))
    .addBody([
      kExprLocalGet, 0,
      ...GCInstr(kExprStructGet), structTypeIndex, 0,
    ])
    .exportFunc();

  builder
    .addFunction("setStructCount", makeSig([refStruct, kWasmI32], []))
    .addBody([
      kExprLocalGet, 0,
      kExprLocalGet, 1,
      ...GCInstr(kExprStructSet), structTypeIndex, 0,
    ])
    .exportFunc();

  const instance = builder.instantiate({}, { builtins: ["js-prototypes"] });

  makeProtosArray = (protos) => {
    const array = instance.exports.makeProtosArray(protos.length);
    for (let i = 0; i < protos.length; i++) {
      instance.exports.setProto(array, i, protos[i]);
    }
    return array;
  };

  makeMethodsArray = (methods) => {
    const array = instance.exports.makeMethodsArray(methods.length);
    for (let i = 0; i < methods.length; i++) {
      instance.exports.setMethod(array, i, methods[i]);
    }
    return array;
  };

  makeDataArray = (data) => {
    const array = instance.exports.makeDataArray(data.length);
    for (let i = 0; i < data.length; i++) {
      instance.exports.setData(array, i, data[i]);
    }
    return array;
  };

  configureAll = instance.exports.configureAll;
  makeStructWithProto = instance.exports.makeStructWithProto;
  getStructCount = instance.exports.getStructCount;
  setStructCount = instance.exports.setStructCount;
  stringToBytes = builder.stringToBytes;
});

test(() => {
  // Check that the builtin validates and the module instantiates.
  const builder = new WasmModuleBuilder();
  addConfigureAll(builder);
  const buffer = builder.toBuffer();

  assert_true(WebAssembly.validate(buffer, { builtins: ["js-prototypes"] }));

  // This should not throw, even though the import is not explicitly provided.
  const module = new WebAssembly.Module(buffer, { builtins: ["js-prototypes"] });
  new WebAssembly.Instance(module, { builtins: ["js-prototypes"]});
}, "import builtin");

test(() => {
  // Putting the types in a non-trivial rec group means the import will have an
  // unexpected type.
  const builder = new WasmModuleBuilder();
  builder.startRecGroup();
  addConfigureAll(builder);
  builder.endRecGroup();

  const buffer = builder.toBuffer();

  assert_false(WebAssembly.validate(buffer, { builtins: ["js-prototypes"] }));

  // It should still validate when not using the builtins.
  assert_true(WebAssembly.validate(buffer));

  assert_throws_js(WebAssembly.CompileError, () => {
    new WebAssembly.Module(buffer, { builtins: ["js-prototypes"] });
  });
}, "wrong import type");

test(() => {
  // A trivial call to configureAll that does not configure anything succeeds.
  configureAll(makeProtosArray([]),
               makeMethodsArray([]),
               makeDataArray([0]),
               null);
}, "trivial");

test(() => {
  // Null array operands cause traps.
  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(null, makeMethodsArray([]), makeDataArray([0]), null);
  });
  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([]), null, makeDataArray([0]), null);
  });
  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([]), makeMethodsArray([]), null, null);
  });
}, "null array references");

test(() => {
  // An empty data array will cause a trap.
  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([]),
                 makeMethodsArray([]),
                 makeDataArray([]),
                 null);
  });
}, "empty data");

test(() => {
  // Extra prototypes will cause a trap.
  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([]),
                 makeDataArray([0]),
                 null);
  });
}, "extra prototypes");

test(() => {
  // Extra methods will cause a trap.
  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([]),
                 makeMethodsArray([getStructCount]),
                 makeDataArray([0]),
                 null);
  });
}, "extra methods");

test(() => {
  // Extra data will cause a trap.
  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([]),
                 makeMethodsArray([]),
                 makeDataArray([0, 0]),
                 null);
  });
}, "extra data");

test(() => {
  // Configure a method, getter, and setter on an imported prototype object
  // attached to an exported struct.
  const data = [
    1, // one prototype
    0, // no constructor
    3, // three method configs
    0x00, // method "count"
    ...stringToBytes("count"),
    0x01, // getter "x"
    ...stringToBytes("x"),
    0x02, // setter "x"
    ...stringToBytes("x"),
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  const proto = {};
  configureAll(makeProtosArray([proto]),
               makeMethodsArray([getStructCount, getStructCount, setStructCount]),
               makeDataArray(data),
               null);

  const struct = makeStructWithProto(proto);
  assert_equals(Object.getPrototypeOf(struct), proto);

  assert_true(Object.hasOwn(proto, "count"));
  assert_true(Object.hasOwn(proto, "x"));

  const countProp = Object.getOwnPropertyDescriptor(proto, "count");
  assert_true(countProp.writable);
  assert_false(countProp.enumerable);
  assert_true(countProp.configurable);
  assert_true(Object.hasOwn(countProp, "value"));
  assert_false(Object.hasOwn(countProp, "get"));
  assert_false(Object.hasOwn(countProp, "set"));
  assert_not_equals(countProp.value, getStructCount);

  const xProp = Object.getOwnPropertyDescriptor(proto, "x");
  assert_false(xProp.enumerable);
  assert_true(xProp.configurable);
  assert_false(Object.hasOwn(xProp, "writable"));
  assert_false(Object.hasOwn(xProp, "value"));
  assert_true(Object.hasOwn(xProp, "get"));
  assert_true(Object.hasOwn(xProp, "set"));
  assert_not_equals(xProp.get, getStructCount);
  assert_not_equals(xProp.set, setStructCount);

  assert_equals(struct.count(), 0);
  assert_equals(struct.x, 0);
  assert_equals(struct.x = 42, 42);
  assert_equals(struct.x, 42);
  assert_equals(struct.count(), 42);
}, "configure methods");

test(() => {
  // Null methods cause traps.
  for (let methodKind of [0x00, 0x01, 0x02]) {
    const data = [
      1, // one prototype
      0, // no constructor
      1, // one method configs
      methodKind, // method, getter, or setter "count"
      ...stringToBytes("count"),
      ...wasmSignedLeb(-1), // no parent prototype
    ];

    const proto = {};
    assert_throws_js(WebAssembly.RuntimeError, () => {
      configureAll(makeProtosArray([proto]),
                  makeMethodsArray([null]),
                  makeDataArray(data),
                  null);
    });
  }
}, "null methods");

test(() => {
  // Configuring methods where properties cannot be written fails.
  const data = [
    1, // one prototype
    0, // no constructor
    1, // one method config
    0x00, // method "x"
    ...stringToBytes("x"),
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  let dataArray = makeDataArray(data);
  let methodsArray = makeMethodsArray([getStructCount]);

  const nonextensible = {};
  Object.preventExtensions(nonextensible);

  const unwritable = {};
  Object.defineProperty(unwritable, "x", { writable: false });

  for (let disallowed of [null, undefined, nonextensible, unwritable, 10, "foo"]) {
    const protosArray = makeProtosArray([disallowed]);
    assert_throws_js(TypeError, () => {
      configureAll(protosArray, methodsArray, dataArray, null);
    });
  }

  const rewritable = { x: 5 };
  Object.preventExtensions(rewritable);

  const otherUnwritable = {};
  Object.defineProperty(otherUnwritable, "y", { writable: false });

  for (let allowed of [rewritable, otherUnwritable]) {
    const protosArray = makeProtosArray([allowed]);
    configureAll(protosArray, methodsArray, dataArray, null);
    assert_true(Object.hasOwn(allowed, "x"));
    assert_equals(makeStructWithProto(allowed).x(), 0);
  }
}, "rewrite properties");

test(() => {
  // Configure a static method, getter, and setter on a newly created constructor.
  const data = [
    1, // one prototype
    1, // one constructor
    ...stringToBytes("MyStruct"),
    3, // three static method configs
    0x00, // method "method"
    ...stringToBytes("method"),
    0x01, // getter "x"
    ...stringToBytes("x"),
    0x02, // setter "x"
    ...stringToBytes("x"),
    0, // no non-static methods
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  const proto = {};
  const constructors = {};
  var count = 0;
  configureAll(makeProtosArray([proto]),
               makeMethodsArray([
                 makeStructWithProto,
                 asWasmFunction((x) => { return count + x; }, kSig_i_i),
                 asWasmFunction(() => { return count; }, kSig_i_v),
                 asWasmFunction((x) => { count = x; }, kSig_v_i),
               ]),
               makeDataArray(data),
               constructors);

  assert_true(Object.hasOwn(proto, "constructor"));
  assert_true(Object.hasOwn(constructors, "MyStruct"));

  const constructorProp = Object.getOwnPropertyDescriptor(proto, "constructor");
  assert_true(constructorProp.configurable);
  assert_false(constructorProp.enumerable);
  assert_true(constructorProp.writable);
  assert_true(Object.hasOwn(constructorProp, "value"));
  assert_false(Object.hasOwn(constructorProp, "get"));
  assert_false(Object.hasOwn(constructorProp, "set"));

  const myStructProp = Object.getOwnPropertyDescriptor(constructors, "MyStruct");
  assert_true(myStructProp.configurable);
  assert_true(myStructProp.enumerable);
  assert_true(myStructProp.writable);
  assert_true(Object.hasOwn(myStructProp, "value"));
  assert_false(Object.hasOwn(myStructProp, "get"));
  assert_false(Object.hasOwn(myStructProp, "set"));

  const MyStruct = constructors.MyStruct;
  assert_equals(proto.constructor, MyStruct);

  assert_true(Object.hasOwn(MyStruct, "prototype"));
  assert_true(Object.hasOwn(MyStruct, "method"));
  assert_true(Object.hasOwn(MyStruct, "x"));

  const prototypeProp = Object.getOwnPropertyDescriptor(MyStruct, "prototype");
  assert_false(prototypeProp.configurable);
  assert_false(prototypeProp.enumerable);
  assert_false(prototypeProp.writable);
  assert_true(Object.hasOwn(prototypeProp, "value"));
  assert_false(Object.hasOwn(prototypeProp, "get"));
  assert_false(Object.hasOwn(prototypeProp, "set"));
  assert_equals(MyStruct.prototype, proto);

  const methodProp = Object.getOwnPropertyDescriptor(MyStruct, "method");
  assert_true(methodProp.configurable);
  assert_false(methodProp.enumerable);
  assert_true(methodProp.writable);
  assert_true(Object.hasOwn(methodProp, "value"));
  assert_false(Object.hasOwn(methodProp, "get"));
  assert_false(Object.hasOwn(methodProp, "set"));

  const xProp = Object.getOwnPropertyDescriptor(MyStruct, "x");
  assert_true(xProp.configurable);
  assert_false(xProp.enumerable);
  assert_false(Object.hasOwn(xProp, "writable"));
  assert_false(Object.hasOwn(xProp, "value"));
  assert_true(Object.hasOwn(xProp, "get"));
  assert_true(Object.hasOwn(xProp, "set"));

  assert_true(makeStructWithProto(proto) instanceof MyStruct);
  assert_true(MyStruct(proto) instanceof MyStruct);
  assert_true(new MyStruct(proto) instanceof MyStruct);

  assert_equals(MyStruct.method(42), 42);
  assert_equals(MyStruct.x, 0);
  assert_equals(count, 0);
  assert_equals(MyStruct.x = 42, 42);
  assert_equals(MyStruct.x, 42);
  assert_equals(count, 42);
  assert_equals(MyStruct.method(42), 84);
}, "configure static methods");

test(() => {
  // Configuring a constructor fails if there are no methods.
  const data = [
    1, // one prototype
    1, // one constructor
    ...stringToBytes("Foo"),
    0, // no static methods
    0, // no non-static methods
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([]),
                 makeDataArray(data),
                 {});
  });
}, "no available constructor");

test(() => {
  // If we configure a constructor, it is a TypeError to try to write it to a
  // null or otherwise nonextensible constructors object
  const data = [
    1, // one prototype
    1, // one constructor
    ...stringToBytes("Foo"),
    0, // no static methods,
    0, // no non-static methods
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  const nonextensible = {};
  Object.preventExtensions(nonextensible);

  const unwritable = {};
  Object.defineProperty(unwritable, "Foo", { writable: false });

  for (disallowed of [null, undefined, 10, "foo", nonextensible, unwritable]) {
    assert_throws_js(TypeError, () => {
      configureAll(makeProtosArray([{}]),
                   makeMethodsArray([makeStructWithProto]),
                   makeDataArray(data),
                   disallowed);
    });
  }
}, "unwritable constructors object");

test(() => {
  // Null static methods cause traps.
  for (let methodKind of [0x00, 0x01, 0x02]) {
    const data = [
      1, // one prototype
      1, // one constructor
      ...stringToBytes("Foo"),
      1, // one static method configs
      methodKind, // method, getter, or setter "method"
      ...stringToBytes("method"),
      0, // no non-static methods
      ...wasmSignedLeb(-1), // no parent prototype
    ];

    const proto = {};
    const constructors = {};
    assert_throws_js(WebAssembly.RuntimeError, () => {
      configureAll(makeProtosArray([proto]),
                  makeMethodsArray([makeStructWithProto, null, null, null]),
                  makeDataArray(data),
                  constructors);
    });
  }
}, "null static methods");

test(() => {
  // We should be able to set the parent prototype.
  const data = [
    2, // two prototypes
    0, // no constructor
    0, // no methods,
    ...wasmSignedLeb(-1), // no parent prototype
    0, // no constructor
    0, // no methods
    0, // parent prototype index 0
  ];

  for (let allowed of [null, {}, Object.getPrototypeOf({}), new Proxy({}, {})]) {
    let proto = {};
    configureAll(makeProtosArray([allowed, proto]),
                 makeMethodsArray([]),
                 makeDataArray(data),
                 null);
    assert_equals(Object.getPrototypeOf(proto), allowed);
  }

  for (let disallowed of [undefined, 10, "foo"]) {
    let proto = {};
    assert_throws_js(TypeError, () => {
      configureAll(makeProtosArray([disallowed, proto]),
                   makeMethodsArray([]),
                   makeDataArray(data),
                   null);
    });
  }
}, "configure parent prototypes");

test(() => {
  // We should be able to configure entire prototype chains.
  const data = [
    4, // four prototypes
    0, 0, // no constructor or methods
    ...wasmSignedLeb(-1), // no parent prototype
    0, 0, // no constructor or methods
    0, // parent prototype index 0
    0, 0, // no constructor or methods
    1, // parent prototype index 1
    0, 0, // no constructor or methods
    2, // parent prototype index 2
  ];

  const a = {};
  const b = {};
  const c = {};
  const d = {};

  configureAll(makeProtosArray([d, c, b, a]),
               makeMethodsArray([]),
               makeDataArray(data),
               null);

  assert_equals(Object.getPrototypeOf(a), b);
  assert_equals(Object.getPrototypeOf(b), c);
  assert_equals(Object.getPrototypeOf(c), d);
  assert_equals(Object.getPrototypeOf(d), Object.getPrototypeOf({}));
}, "prototype chain");

test(() => {
  // A prototype cannot be its own parent.
  const data = [
    1, // one prototype
    0, 0, // no constructor or methods
    0, // parent prototype index 0
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([]),
                 makeDataArray(data),
                 null);
  });
}, "prototype self reference");

test(() => {
  // Parent prototypes must not be forward references.
  const data = [
    2, // two prototypes
    0, 0, // no constructor or methods
    1, // parent prototype index 0
    0, 0, // no constructor or methods
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([]),
                 makeDataArray(data),
                 null);
  });
}, "prototype forward reference");

test(() => {
  // Trap if we unexpectedly run out of data.
  const data = [
    1, // one prototype
    0, 0, // no constructor or methods
    // missing parent prototype index
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([]),
                 makeDataArray(data),
                 null);
  });
}, "early end of data");

test(() => {
  // Trap on invalid data, e.g. invalid property kinds.
  const data = [
    1, // one prototype
    0, // no constructor
    1, // one method
    0x03, // invalid property kind
    ...stringToBytes("invalid"),
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([getStructCount]),
                 makeDataArray(data),
                 null);
  });
}, "invalid property kind");

test(() => {
  // Trap if a prototype has more than one constructor.
  const data = [
    1, // one prototype
    2, // two constructors
    0, // no static methods
    0, // no static methods
    0, // no non-static methods
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([makeStructWithProto, makeStructWithProto]),
                 makeDataArray(data),
                 null);
  });
}, "multiple constructors");

test(() => {
  // Names are encoded as UTF-8.
  const data = [
    1, // one prototype
    1, // one constructor
    0x4, // four bytes in name
    0xF0, 0x9F, 0x8E, 0xB6, // U+1F3B6 (🎶)
    0, // no static methods
    1, // one method
    0x00, // normal method
    0x3, // three bytes in name
    0xea, 0x99, 0xae, // U+A66E (ꙮ)
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  const proto = {};
  const constructors = {};
  configureAll(makeProtosArray([proto]),
               makeMethodsArray([makeStructWithProto, getStructCount]),
               makeDataArray(data),
               constructors);
  assert_true(Object.hasOwn(constructors, "\u{1F3B6}"));
  assert_true(Object.hasOwn(proto, "\u{A66E}"));
}, "UTF-8 names");

test(() => {
  // Trap if a method name has invalid UTF-8.
  const data = [
    1, // one prototype
    0, // no constructor
    1, // one method
    0x00, // normal method
    0x2, // two bytes in name
    0b11011111, 0b00000000, // invalid UTF-8
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([getStructCount]),
                 makeDataArray(data),
                 null);
  });
}, "invalid method name");

test(() => {
  // Trap if a constructor name has invalid UTF-8.
  const data = [
    1, // one prototype
    1, // one constructor
    0x3, // three bytes in name
    0b11100000, 0b10000000, 0b00000000, // invalid UTF-8
    0, // no static methods
    0, // no non-static methods
    ...wasmSignedLeb(-1), // no parent prototype
  ];

  assert_throws_js(WebAssembly.RuntimeError, () => {
    configureAll(makeProtosArray([{}]),
                 makeMethodsArray([makeStructWithProto]),
                 makeDataArray(data),
                 {});
  });
}, "invalid constructor name");
