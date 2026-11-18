// META: global=window,dedicatedworker,jsshell
// META: script=/wasm/jsapi/wasm-module-builder.js

let functions = {};
setup(() => {
  const builder = new WasmModuleBuilder();

  const structIndex = builder.addStruct([makeField(kWasmI32, true)]);
  const arrayIndex = builder.addArray(kWasmI32, true);
  const structRef = wasmRefType(structIndex);
  const arrayRef = wasmRefType(arrayIndex);

  builder
    .addFunction("makeStruct", makeSig_r_v(structRef))
    .addBody([...wasmI32Const(42),
              ...GCInstr(kExprStructNew), structIndex])
    .exportFunc();

  builder
    .addFunction("makeArray", makeSig_r_v(arrayRef))
    .addBody([...wasmI32Const(5), ...wasmI32Const(42),
              ...GCInstr(kExprArrayNew), arrayIndex])
    .exportFunc();

  const buffer = builder.toBuffer();
  const module = new WebAssembly.Module(buffer);
  const instance = new WebAssembly.Instance(module, {});
  functions = instance.exports;
});

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_equals(struct.foo, undefined);
  assert_equals(struct[0], undefined);
  assert_equals(array.foo, undefined);
  assert_equals(array[0], undefined);
}, "property access");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_false("foo" in struct);
  assert_false(0 in struct);
  assert_false("foo" in array);
  assert_false(0 in array);
  assert_false(Reflect.has(struct, "foo"));
  assert_false(Reflect.has(struct, 0));
  assert_false(Reflect.has(array, "foo"));
  assert_false(Reflect.has(array, 0));
}, "in operator");

test(() => {
  "use strict";
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_throws_js(TypeError, () => { struct.foo = 5; });
  assert_throws_js(TypeError, () => { array.foo = 5; });
  assert_throws_js(TypeError, () => { struct[0] = 5; });
  assert_throws_js(TypeError, () => { array[0] = 5; });
}, "property assignment (strict mode)");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  struct.foo = 5;
  array.foo = 5;
  struct[0] = 5;
  array[0] = 5;
  assert_equals(struct.foo, undefined);
  assert_equals(array.foo, undefined);
  assert_equals(struct[0], undefined);
  assert_equals(array[0], undefined);
  assert_false(Reflect.set(struct, "foo", 5));
  assert_false(Reflect.set(array, "foo", 5));
  assert_false(Reflect.set(struct, 0, 5));
  assert_false(Reflect.set(array, 0, 5));
}, "property assignment (non-strict mode)");

test(() => {
  "use strict";
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const structChild = Object.create(struct);
  const arrayChild = Object.create(array);
  structChild.foo = 5;
  structChild[0] = 6;
  arrayChild.foo = 5;
  arrayChild[0] = 6;
  assert_equals(structChild.foo, 5);
  assert_equals(structChild[0], 6);
  assert_equals(arrayChild.foo, 5);
  assert_equals(arrayChild[0], 6);
  assert_true(Object.hasOwn(structChild, "foo"));
  assert_true(Object.hasOwn(structChild, 0));
  assert_true(Object.hasOwn(arrayChild, "foo"));
  assert_true(Object.hasOwn(arrayChild, 0));
  assert_equals(struct.foo, undefined);
  assert_equals(struct[0], undefined);
  assert_equals(array.foo, undefined);
  assert_equals(array[0], undefined);
}, "property assignment on child object (strict mode)");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const structChild = Object.create(struct);
  const arrayChild = Object.create(array);
  structChild.foo = 5;
  structChild[0] = 6;
  arrayChild.foo = 5;
  arrayChild[0] = 6;
  assert_equals(structChild.foo, 5);
  assert_equals(structChild[0], 6);
  assert_equals(arrayChild.foo, 5);
  assert_equals(arrayChild[0], 6);
  assert_true(Object.hasOwn(structChild, "foo"));
  assert_true(Object.hasOwn(structChild, 0));
  assert_true(Object.hasOwn(arrayChild, "foo"));
  assert_true(Object.hasOwn(arrayChild, 0));
  assert_equals(struct.foo, undefined);
  assert_equals(struct[0], undefined);
  assert_equals(array.foo, undefined);
  assert_equals(array[0], undefined);
}, "property assignment on child object (non-strict mode)");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const structReceiver = {};
  const arrayReceiver = {};
  assert_true(Reflect.set(struct, "foo", 5, structReceiver));
  assert_true(Reflect.set(struct, 0, 6, structReceiver));
  assert_true(Reflect.set(array, "foo", 5, arrayReceiver));
  assert_true(Reflect.set(array, 0, 6, arrayReceiver));
  assert_equals(structReceiver.foo, 5);
  assert_equals(structReceiver[0], 6);
  assert_equals(arrayReceiver.foo, 5);
  assert_equals(arrayReceiver[0], 6);
  assert_equals(struct.foo, undefined);
  assert_equals(struct[0], undefined);
  assert_equals(array.foo, undefined);
  assert_equals(array[0], undefined);

  const target = {};
  assert_false(Reflect.set(target, "foo", 5, struct));
  assert_false(Reflect.set(target, 0, 6, struct));
  assert_false(Reflect.set(target, "foo", 5, array));
  assert_false(Reflect.set(target, 0, 6, array));
  assert_equals(Object.getOwnPropertyNames(target).length, 0);
  assert_equals(struct.foo, undefined);
  assert_equals(struct[0], undefined);
  assert_equals(array.foo, undefined);
  assert_equals(array[0], undefined);
}, "Reflect.set with receiver");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_equals(Object.getOwnPropertyNames(struct).length, 0);
  assert_equals(Object.getOwnPropertyNames(array).length, 0);
}, "ownPropertyNames");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const structKeys = [];
  for (const key in struct) {
    structKeys.push(key);
  }
  assert_array_equals(structKeys, []);
  const arrayKeys = [];
  for (const key in array) {
    arrayKeys.push(key);
  }
  assert_array_equals(arrayKeys, []);
  assert_array_equals(Object.keys(struct), []);
  assert_array_equals(Object.keys(array), []);
}, "for-in enumeration");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_throws_js(TypeError, () => Object.defineProperty(struct, "foo", { value: 1 }));
  assert_throws_js(TypeError, () => Object.defineProperty(struct, 0, { value: 1 }));
  assert_throws_js(TypeError, () => Object.defineProperty(array, "foo", { value: 1 }));
  assert_throws_js(TypeError, () => Object.defineProperty(array, 0, { value: 1 }));
  assert_false(Reflect.defineProperty(struct, "foo", { value: 1 }));
  assert_false(Reflect.defineProperty(struct, 0, { value: 1 }));
  assert_false(Reflect.defineProperty(array, "foo", { value: 1 }));
  assert_false(Reflect.defineProperty(array, 0, { value: 1 }));
}, "defineProperty");

test(() => {
  "use strict";
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_true(delete struct.foo);
  assert_true(delete struct[0]);
  assert_true(delete array.foo);
  assert_true(delete array[0]);
}, "delete (strict mode)");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_true(delete struct.foo);
  assert_true(delete struct[0]);
  assert_true(delete array.foo);
  assert_true(delete array[0]);
  assert_true(Reflect.deleteProperty(struct, "foo"));
  assert_true(Reflect.deleteProperty(struct, 0));
  assert_true(Reflect.deleteProperty(array, "foo"));
  assert_true(Reflect.deleteProperty(array, 0));
}, "delete (non-strict mode)");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_equals(Object.getPrototypeOf(struct), null);
  assert_equals(Object.getPrototypeOf(array), null);
}, "getPrototypeOf");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_throws_js(TypeError, () => Object.setPrototypeOf(struct, {}));
  assert_throws_js(TypeError, () => Object.setPrototypeOf(array, {}));
  assert_false(Reflect.setPrototypeOf(struct, {}));
  assert_false(Reflect.setPrototypeOf(array, {}));
  assert_equals(Object.setPrototypeOf(struct, null), struct);
  assert_equals(Object.setPrototypeOf(array, null), array);
  assert_true(Reflect.setPrototypeOf(struct, null));
  assert_true(Reflect.setPrototypeOf(array, null));
}, "setPrototypeOf");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_false(Object.isExtensible(struct));
  assert_false(Object.isExtensible(array));
}, "isExtensible");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_true(Reflect.preventExtensions(struct));
  assert_true(Reflect.preventExtensions(array));
  assert_equals(Object.preventExtensions(struct), struct);
  assert_equals(Object.preventExtensions(array), array);
}, "preventExtensions");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_true(Object.isSealed(struct));
  assert_true(Object.isSealed(array));
  assert_equals(Object.seal(struct), struct);
  assert_equals(Object.seal(array), array);
}, "sealing");

test(() => {
  // Empty sealed objects are also frozen.
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_true(Object.isFrozen(struct));
  assert_true(Object.isFrozen(array));
  assert_equals(Object.freeze(struct), struct);
  assert_equals(Object.freeze(array), array);
}, "freezing");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_equals(typeof struct, "object");
  assert_equals(typeof array, "object");
}, "typeof");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_throws_js(TypeError, () => struct.toString());
  assert_equals(Object.prototype.toString.call(struct), "[object Object]");
  assert_throws_js(TypeError, () => array.toString());
  assert_equals(Object.prototype.toString.call(array), "[object Object]");
}, "toString");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_throws_js(TypeError, () => struct.valueOf());
  assert_equals(Object.prototype.valueOf.call(struct), struct);
  assert_throws_js(TypeError, () => array.valueOf());
  assert_equals(Object.prototype.valueOf.call(array), array);
}, "valueOf");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  assert_equals(JSON.stringify(struct), "{}");
  assert_equals(JSON.stringify(array), "{}");
  assert_equals(JSON.stringify([struct, array]), "[{},{}]");
  assert_equals(JSON.stringify({ a: struct, b: array }), '{"a":{},"b":{}}');
}, "JSON.stringify");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const map = new Map();
  map.set(struct, "struct");
  map.set(array, "array");
  assert_equals(map.get(struct), "struct");
  assert_equals(map.get(array), "array");
}, "GC objects as map keys");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const set = new Set();
  set.add(struct);
  set.add(array);
  assert_true(set.has(struct));
  assert_true(set.has(array));
}, "GC objects as set element");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const map = new WeakMap();
  map.set(struct, "struct");
  map.set(array, "array");
  assert_equals(map.get(struct), "struct");
  assert_equals(map.get(array), "array");
}, "GC objects as weak map keys");

test(() => {
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  const set = new WeakSet();
  set.add(struct);
  set.add(array);
  assert_true(set.has(struct));
  assert_true(set.has(array));
}, "GC objects as weak set element");

// See https://github.com/tc39/proposal-nonextensible-applies-to-private, which
// in practice already applies to Wasm objects.
test(() => {
  class Base {
    constructor(o) {
      return o;
    }
  }
  class StampField extends Base {
    #field = 42;
  }
  class StampMethod extends Base {
    #method() {
      return 42;
    }
  }
  class StampGetter extends Base {
    get #getter() {
      return 42;
    }
  }
  class StampSetter extends Base {
    set #setter(v) {}
  }
  const struct = functions.makeStruct();
  const array = functions.makeArray();
  for (const Ctor of [
    StampField,
    StampMethod,
    StampGetter,
    StampSetter,
  ]) {
    assert_throws_js(TypeError, () => new Ctor(struct));
    assert_throws_js(TypeError, () => new Ctor(array));
  }
}, "private field, method, and accessor stamping");
