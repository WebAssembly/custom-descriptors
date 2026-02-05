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
