// META: global=window,dedicatedworker,jsshell
// META: script=/wasm/jsapi/wasm-module-builder.js

const kDisallowedPrototypes = [
  null, undefined, "", true, 1.0, -0, 10n, NaN, Symbol(),
];

const kAllowedPrototypes = [
  {}, new Proxy({}, {}),
];

let exports = {};

setup(() => {
  const builder = new WasmModuleBuilder();

  builder.startRecGroup();
  const descIndex = builder.nextTypeIndex() + 1;
  const structIndex = builder.addStruct({descriptor: descIndex});
  builder.addStruct({describes: structIndex, fields: [
    makeField(kWasmExternRef, false),
  ]});
  builder.endRecGroup();

  builder
    .addFunction("makeStructWithPrototype",
                 makeSig([kWasmExternRef], [wasmRefType(structIndex)]))
    .addBody([
      kExprLocalGet, 0,
      kGCPrefix, kExprStructNew, descIndex,
      kGCPrefix, kExprStructNewDesc, structIndex
    ])
    .exportFunc();

  exports = builder.instantiate({}).exports;
  kAllowedPrototypes.push(exports.makeStructWithPrototype(null));
});

test(() => {
  // Check that prototype identity is as expected when allocated at runtime.
  for (let proto of kAllowedPrototypes) {
    let obj = exports.makeStructWithPrototype(proto);
    assert_equals(Object.getPrototypeOf(obj), proto);
  }
}, "allowed prototypes");

test(() => {
  for (let proto of kDisallowedPrototypes) {
    // Non-object values should produce null prototypes.
    let obj = exports.makeStructWithPrototype(proto);
    assert_equals(Object.getPrototypeOf(obj), null);
  }
}, "disallowed prototype");

test(() => {
  // Check that prototype identity is as expected when allocated in globals.
  const builder = new WasmModuleBuilder();

  builder.startRecGroup();
  const descIndex = builder.nextTypeIndex() + 1;
  const structIndex = builder.addStruct({descriptor: descIndex});
  builder.addStruct({describes: structIndex, fields: [
    makeField(kWasmExternRef, false),
  ]});
  builder.endRecGroup();

  builder.addImportedGlobal("env", "proto", kWasmExternRef);
  const objIndex = builder.addGlobal(wasmRefType(structIndex), false, [
    kExprGlobalGet, 0,
    kGCPrefix, kExprStructNew, descIndex,
    kGCPrefix, kExprStructNewDesc, structIndex,
  ]);
  builder.addExportOfKind("obj", kExternalGlobal, objIndex.index);

  let module = builder.toModule();

  for (let proto of kAllowedPrototypes) {
    let instance = new WebAssembly.Instance(module, {env: {proto}});
    assert_equals(Object.getPrototypeOf(instance.exports.obj.value), proto);
  }
  for (let proto of kDisallowedPrototypes) {
    let instance = new WebAssembly.Instance(module, {env: {proto}});
    assert_equals(Object.getPrototypeOf(instance.exports.obj.value), null);
  }
}, "global prototype");

test(() => {
  // Check that a mutable field does not work.
  const builder = new WasmModuleBuilder();

  builder.startRecGroup();
  const descIndex = builder.nextTypeIndex() + 1;
  const structIndex = builder.addStruct({descriptor: descIndex});
  builder.addStruct({describes: structIndex, fields: [
    makeField(kWasmExternRef, true),
  ]});
  builder.endRecGroup();

  builder
    .addFunction("makeStructWithPrototype",
                 makeSig([kWasmExternRef], [wasmRefType(structIndex)]))
    .addBody([
      kExprLocalGet, 0,
      kGCPrefix, kExprStructNew, descIndex,
      kGCPrefix, kExprStructNewDesc, structIndex
    ])
    .exportFunc();

  let make = builder.instantiate({}).exports.makeStructWithPrototype;
  for (let proto of kAllowedPrototypes) {
    assert_equals(Object.getPrototypeOf(make(proto)), null);
  }
  for (let proto of kDisallowedPrototypes) {
    assert_equals(Object.getPrototypeOf(make(proto)), null);
  }
}, "mutable field");

test(() => {
  // Check that the second field does not work.
  const builder = new WasmModuleBuilder();

  builder.startRecGroup();
  const descIndex = builder.nextTypeIndex() + 1;
  const structIndex = builder.addStruct({descriptor: descIndex});
  builder.addStruct({describes: structIndex, fields: [
    makeField(kWasmI32, false),
    makeField(kWasmExternRef, false),
  ]});
  builder.endRecGroup();

  builder
    .addFunction("makeStructWithPrototype",
                 makeSig([kWasmExternRef], [wasmRefType(structIndex)]))
    .addBody([
      kExprI32Const, 0,
      kExprLocalGet, 0,
      kGCPrefix, kExprStructNew, descIndex,
      kGCPrefix, kExprStructNewDesc, structIndex
    ])
    .exportFunc();

  let make = builder.instantiate({}).exports.makeStructWithPrototype;
  for (let proto of kAllowedPrototypes) {
    assert_equals(Object.getPrototypeOf(make(proto)), null);
  }
  for (let proto of kDisallowedPrototypes) {
    assert_equals(Object.getPrototypeOf(make(proto)), null);
  }
}, "second field");

test(() => {
  // Check that using a non-nullable extern reference works.
  const builder = new WasmModuleBuilder();

  builder.startRecGroup();
  const descIndex = builder.nextTypeIndex() + 1;
  const structIndex = builder.addStruct({descriptor: descIndex});
  builder.addStruct({describes: structIndex, fields: [
    makeField(wasmRefType(kWasmExternRef), false),
  ]});
  builder.endRecGroup();

  builder
    .addFunction("makeStructWithPrototype",
                 makeSig([wasmRefType(kWasmExternRef)], [wasmRefType(structIndex)]))
    .addBody([
      kExprLocalGet, 0,
      kGCPrefix, kExprStructNew, descIndex,
      kGCPrefix, kExprStructNewDesc, structIndex
    ])
    .exportFunc();

  let make = builder.instantiate({}).exports.makeStructWithPrototype;
  for (let proto of kAllowedPrototypes) {
    assert_equals(Object.getPrototypeOf(make(proto)), proto);
  }
  for (let proto of kDisallowedPrototypes) {
    if (proto == null) {
      // Avoid TypeError when passing null as a non-nullable reference.
      continue;
    }
    assert_equals(Object.getPrototypeOf(make(proto)), null);
  }
}, "non-nullable field");

test(() => {
  // Test prototypes on a descriptor of descriptor.
  const builder = new WasmModuleBuilder();

  builder.startRecGroup();
  const descIndex = builder.nextTypeIndex() + 1;
  const metaIndex = descIndex + 1;
  const structIndex = builder.addStruct({descriptor: descIndex});
  builder.addStruct({describes: structIndex, descriptor: metaIndex});
  builder.addStruct({describes: descIndex, fields: [
    makeField(kWasmExternRef, false),
  ]});
  builder.endRecGroup();

  builder
    .addFunction("makeStructWithPrototype",
                 makeSig([kWasmExternRef], [wasmRefType(descIndex)]))
    .addBody([
      kExprLocalGet, 0,
      kGCPrefix, kExprStructNew, metaIndex,
      kGCPrefix, kExprStructNewDesc, descIndex,
    ])
    .exportFunc();

  let make = builder.instantiate({}).exports.makeStructWithPrototype;
  for (let proto of kAllowedPrototypes) {
    assert_equals(Object.getPrototypeOf(make(proto)), proto);
  }
  for (let proto of kDisallowedPrototypes) {
    assert_equals(Object.getPrototypeOf(make(proto)), null);
  }
}, "descriptor chain");

test(() => {
  const proto = {
    foo: 42,
    0: "zero",
    get self() {
      return this;
    },
  };
  const obj = exports.makeStructWithPrototype(proto);
  const other = {};
  assert_equals(obj.foo, 42);
  assert_equals(obj[0], "zero");
  assert_equals(obj.bar, undefined);
  assert_equals(obj.self, obj);
  assert_equals(Reflect.get(obj, "foo"), 42);
  assert_equals(Reflect.get(obj, "self"), obj);
  assert_equals(Reflect.get(obj, "self", other), other);
  assert_false(Object.hasOwn(obj, "foo"));
  assert_equals(Object.getOwnPropertyDescriptor(obj, "foo"), undefined);
  assert_equals(Object.getOwnPropertyNames(obj).length, 0);
  assert_equals(obj.toString(), "[object Object]");
  assert_equals(obj.valueOf(), obj);
}, "inherited property access");

test(() => {
  const proto = {
    foo: 42,
    0: "zero",
    get self() {
      return this;
    },
  };
  const obj = exports.makeStructWithPrototype(proto);
  assert_true("foo" in obj);
  assert_true(0 in obj);
  assert_true("self" in obj);
  assert_true("toString" in obj);
  assert_false("bar" in obj);
  assert_false(1 in obj);
  assert_true(Reflect.has(obj, "foo"));
  assert_true(Reflect.has(obj, 0));
  assert_false(Reflect.has(obj, "bar"));
}, "in operator");

test(() => {
  function Ctor() {}
  function Other() {}
  const obj = exports.makeStructWithPrototype(Ctor.prototype);
  assert_true(obj instanceof Ctor);
  assert_true(obj instanceof Object);
  assert_false(obj instanceof Other);
}, "instanceof");

test(() => {
  const calls = [];
  const proto = {
    set prop(v) {
      calls.push([this, v]);
    },
    get getterOnly() {
      return 1;
    },
  };
  const obj = exports.makeStructWithPrototype(proto);

  obj.prop = 10;
  (() => {
    "use strict";
    obj.prop = 20;
  })();
  assert_true(Reflect.set(obj, "prop", 30));
  const receiver = {};
  assert_true(Reflect.set(obj, "prop", 40, receiver));

  assert_equals(calls.length, 4);
  assert_equals(calls[0][0], obj);
  assert_equals(calls[0][1], 10);
  assert_equals(calls[1][0], obj);
  assert_equals(calls[1][1], 20);
  assert_equals(calls[2][0], obj);
  assert_equals(calls[2][1], 30);
  assert_equals(calls[3][0], receiver);
  assert_equals(calls[3][1], 40);

  obj.getterOnly = 2;
  assert_equals(obj.getterOnly, 1);
  assert_throws_js(TypeError, () => {
    "use strict";
    obj.getterOnly = 2;
  });
  assert_false(Reflect.set(obj, "getterOnly", 2));
}, "inherited setter");

test(() => {
  const proto = { foo: 1, 0: 2 };
  const obj = exports.makeStructWithPrototype(proto);

  obj.foo = 5;
  obj[0] = 6;
  obj.bar = 7;
  assert_equals(obj.foo, 1);
  assert_equals(obj[0], 2);
  assert_equals(obj.bar, undefined);
  assert_equals(proto.foo, 1);
  assert_equals(proto[0], 2);

  assert_throws_js(TypeError, () => {
    "use strict";
    obj.foo = 5;
  });
  assert_throws_js(TypeError, () => {
    "use strict";
    obj[0] = 6;
  });
  assert_throws_js(TypeError, () => {
    "use strict";
    obj.bar = 7;
  });

  assert_false(Reflect.set(obj, "foo", 5));
  assert_false(Reflect.set(obj, 0, 6));
  assert_false(Reflect.set(obj, "bar", 7));
}, "property assignment with prototype");

test(() => {
  const proto = { writableProp: 1 };
  Object.defineProperty(proto, "readonlyProp", { value: 2, writable: false });
  const obj = exports.makeStructWithPrototype(proto);

  const child = Object.create(obj);
  child.writableProp = 10;
  assert_equals(child.writableProp, 10);
  assert_true(Object.hasOwn(child, "writableProp"));
  assert_equals(obj.writableProp, 1);
  assert_equals(proto.writableProp, 1);

  const strictChild = Object.create(obj);
  (() => {
    "use strict";
    strictChild.writableProp = 15;
  })();
  assert_equals(strictChild.writableProp, 15);
  assert_true(Object.hasOwn(strictChild, "writableProp"));

  const receiver = {};
  assert_true(Reflect.set(obj, "writableProp", 20, receiver));
  assert_equals(receiver.writableProp, 20);
  assert_equals(obj.writableProp, 1);
  assert_equals(proto.writableProp, 1);

  child.readonlyProp = 10;
  assert_equals(child.readonlyProp, 2);
  assert_false(Object.hasOwn(child, "readonlyProp"));
  assert_throws_js(TypeError, () => {
    "use strict";
    child.readonlyProp = 10;
  });
  assert_false(Reflect.set(obj, "readonlyProp", 10, child));
  assert_equals(child.readonlyProp, 2);
}, "property assignment on child object with prototype");

test(() => {
  const proto = { foo: 42, 0: "zero" };
  const obj = exports.makeStructWithPrototype(proto);

  assert_true(delete obj.foo);
  assert_true(delete obj[0]);
  (() => {
    "use strict";
    assert_true(delete obj.foo);
    assert_true(delete obj[0]);
  })();
  assert_true(Reflect.deleteProperty(obj, "foo"));
  assert_true(Reflect.deleteProperty(obj, 0));
  assert_equals(proto.foo, 42);
  assert_equals(proto[0], "zero");
  assert_equals(obj.foo, 42);
  assert_equals(obj[0], "zero");
}, "delete with prototype");

test(() => {
  const proto = {};
  const obj = exports.makeStructWithPrototype(proto);
  assert_equals(Object.setPrototypeOf(obj, proto), obj);
  assert_true(Reflect.setPrototypeOf(obj, proto));
  assert_throws_js(TypeError, () => Object.setPrototypeOf(obj, null));
  assert_false(Reflect.setPrototypeOf(obj, null));
  assert_throws_js(TypeError, () => Object.setPrototypeOf(obj, {}));
  assert_false(Reflect.setPrototypeOf(obj, {}));
  assert_throws_js(TypeError, () => Object.setPrototypeOf(obj, obj));
  assert_false(Reflect.setPrototypeOf(obj, obj));
  assert_throws_js(TypeError, () => Object.setPrototypeOf(proto, obj));
  assert_false(Reflect.setPrototypeOf(proto, obj));
  const child = Object.create(obj);
  assert_throws_js(TypeError, () => Object.setPrototypeOf(proto, child));
  assert_false(Reflect.setPrototypeOf(proto, child));
  assert_equals(Object.getPrototypeOf(obj), proto);
  assert_equals(Object.getPrototypeOf(proto), Object.prototype);
}, "setPrototypeOf with prototype");

test(() => {
  const obj = exports.makeStructWithPrototype({ foo: 1 });
  assert_false(Object.isExtensible(obj));
  assert_true(Object.isSealed(obj));
  // Empty sealed objects are also frozen.
  assert_true(Object.isFrozen(obj));
  assert_true(Reflect.preventExtensions(obj));
  assert_equals(Object.preventExtensions(obj), obj);
  assert_equals(Object.seal(obj), obj);
  assert_equals(Object.freeze(obj), obj);
}, "integrity levels with prototype");

test(() => {
  const proto = Object.create(null, {
    enumProp: { value: 1, enumerable: true },
    nonEnumProp: { value: 2, enumerable: false },
    [Symbol("sym")]: { value: 3, enumerable: true },
  });
  const obj = exports.makeStructWithPrototype(proto);
  const keys = [];
  for (const key in obj) {
    keys.push(key);
  }
  assert_array_equals(keys, ["enumProp"]);
  assert_array_equals(Object.keys(obj), []);
}, "for-in and Object.keys with prototype");

test(() => {
  const obj = exports.makeStructWithPrototype({ enumProp: 1 });
  assert_equals(JSON.stringify(obj), "{}");
  assert_equals(JSON.stringify([obj]), "[{}]");
  assert_equals(JSON.stringify({ a: obj }), '{"a":{}}');

  const withToJSON = exports.makeStructWithPrototype({
    toJSON(key) {
      return { key, isSelf: this === withToJSON };
    },
  });
  assert_equals(JSON.stringify({ x: withToJSON }), '{"x":{"key":"x","isSelf":true}}');
}, "JSON.stringify with prototype");
