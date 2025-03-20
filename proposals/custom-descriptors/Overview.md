# Custom Descriptors and JS Interop for WasmGC Structs

This proposal primarily provides mechanisms to:

 1. Save memory in WasmGC structs by allowing data associated with source types
    (e.g. static fields, vtables, itables, etc.)
    to be accessed alongside the engine-managed runtime type information (RTT)
    in a custom descriptor object for their corresponding WebAssembly types.
    Rather than using a user-controlled reference field
    to point to this type-associated information,
    structs can now use the RTT reference in their engine-managed header
    to refer to this information.

 1. Associate JS prototypes with WasmGC structs via custom descriptors,
    allowing methods to be called on WasmGC structs from JS.

Secondarily, this proposal provides mechanisms
to alleviate anticipated problems that will arise from the use of its primary features:

 1. A way to declaratively populate JS prototypes with wrapped exported functions
    to reduce startup time when there are many prototypes to populate.

 2. A way to deduplicate lists of fields in type sections.
    Using custom RTTs may otherwise lead to more duplication in the type section
    than there is today.

We should validate that these problem actually arise in practice and quantify their cost
before we commit to including these extra solutions in the final version of the proposal.

This proposal and the custom descriptors are informally called "custom RTTs,"
although the RTT is more precisely the engine-managed type information inside the custom descriptor,
not the custom descriptor itself.

## Custom Descriptor Definitions

Custom descriptor types are defined struct types with a `describes` clause saying
what other defined struct type they provide runtime type information for.
Similarly, struct types that use custom descriptors have a `descriptor` clause saying
what type their custom descriptors have.

```wasm
(rec
  (type $foo (descriptor $foo.rtt (struct (field ...))))
  (type $foo.rtt (describes $foo (struct (field ...))))
)
```

Note that because the definitions of the describing and described types
must refer to each other,
they must be in a recursion group with each other.

Just like all other parts of a type definition,
`descriptor` and `describes` clauses are part of the structure of a type definition
and help determine the type's identity.

In the following example,
types `$A` and `$B` are the same,
but type `$C` is different.

```wasm
(rec
  (type $A (descriptor $A.rtt (struct (field i32))))
  (type $A.rtt (describes $A (struct (field i32))))
)

(rec
  (type $B (descriptor $B.rtt (struct (field i32))))
  (type $B.rtt (describes $B (struct (field i32))))
)

(rec
  ;; Different: no describes or descriptor clauses.
  (type $C (struct (field i32)))
  (type $C.rtt (struct (field i32)))
)
```

A type may have both `descriptor` and `describes` clauses,
creating arbitrarily long chains of meta-descriptors:

```wasm
(rec
  (type $foo (descriptor $foo.rtt (struct)))
  (type $foo.rtt (describes $foo (descriptor $foo.meta-rtt (struct))))
  (type $foo.meta-rtt (describes $foo.rtt (struct)))
)
```

> Note: If engines encounter difficulties implementing this,
> we can alternatively disallow types from having
> both `describes` and `descriptor` clauses.

`descriptor` and `describes` clauses must agree,
i.e. a describing type must have a `describes` clause referring to its described type,
which in turn must have a `descriptor` clause referring to the describing type.

```wasm
(rec
  (type $A (struct))
  (type $B (descriptor $C (struct)))
  (type $C (describes $A (struct))) ;; Invalid: must be 'describes $B'
)
```

> Note: This rule means that the `describes` clause is redundant
> and could be inferred from the existence of the `descriptor` clause,
> but we require the `describes` clause anyway so the layout of the custom descriptor type
> can be determined just by looking at its definition.

It is also invalid for a type to be its own descriptor,
or more generally for it to appear in its own descriptor chain.
This is statically enforced by validating that `describes` clauses may only refer
to previously defined types.
This is the same strategy we use for ensuring supertype chains do not have cycles.

```wasm
(rec
  ;; Invalid describes clause: $self is not a previously defined type.
  (type $self (describes $self (descriptor $self (struct))))

  ;; Invalid describes clause: $pong is not a previously defined type.
  (type $ping (describes $pong (descriptor $pong (struct))))
  (type $pong (describes $ping (descriptor $ping (struct))))

  ;; Invalid describes clause: $foo is not a previously defined type.
  (type $foo.rtt (describes $foo (struct)))
  (type $foo (descriptor $foo.rtt (struct)))
)
```

Just like any other struct types,
struct types with `describes` or `descriptor` clauses support width and depth subtyping.
However, the following new subtyping rules are introduced:

 - A declared supertype of a type with a `(descriptor $x)` clause must either
   not have a `descriptor` clause or have a `(descriptor $y)` clause,
   where `$y` is a declared supertype of `$x`.

 - A declared supertype of a type without a `descriptor` clause must also
   not have a `descriptor` clause.

 - A declared supertype of a type with a `describes` clause must have a
   `describes` clause.

 - A declared supertype of a type without a `describes` clause must also
   not have a `describes` clause.

The first two rules,
governing types with or without `descriptor` clauses,
are necessary to ensure the soundness of the `ref.get_desc` instruction described below.
The latter two rules,
governing types with or without `describes` clauses,
are necessary to ensure subtypes have layouts compatible with their supertypes.
Custom descriptor types (i.e. those with `describes` clauses)
may have different layouts than other structs because their user-controlled fields
might be laid out after the engine-managed RTT for the type they describe.
(But this is just one possible implementation that we specifically want to allow.)

```wasm
(rec
  (type $super (sub (descriptor $super.rtt (struct))))
  (type $super.rtt (sub (describes $super (struct))))

  ;; Ok
  (type $sub (sub $super (descriptor $sub.rtt (struct))))
  (type $sub.rtt (sub $super.rtt (describes $sub (struct))))
)

(rec
  (type $super (sub (struct)))

  ;; Ok
  (type $sub (sub $super (descriptor $sub.rtt (struct))))
  (type $sub.rtt (describes $sub (struct)))
)

(rec
  (type $super (sub (descriptor $super.rtt (struct ))))
  (type $super.rtt (sub (describes $super (struct))))

  ;; Ok (but strange)
  (type $other (struct))
  (type $sub.rtt (sub $super.rtt (describes $other (struct))))
)

(rec
  (type $super (sub (descriptor $super.rtt (struct))))
  (type $super.rtt (sub (describes $super (struct))))

  ;; Invalid: Must be described by an immediate subtype of $super.rtt.
  (type $sub (sub $super (struct)))

  ;; Invalid: Must describe an immediate subtype of $super.
  (type $sub.rtt (sub $super.rtt (struct)))
)

(rec
  (type $super (sub (descriptor $super.rtt (struct))))
  (type $super.rtt (sub (describes $super (struct))))

  ;; Invalid: $other.rtt must be a an immediate subtype of $super.rtt.
  (type $sub (sub $super (descriptor $other.rtt (struct))))
  (type $other.rtt (describes $sub (struct)))
)
```

> Note: We could also allow types with `(descriptor none)` clauses,
> which would have no associated RTT at all,
> saving even more space.
> Casts to these types would always fail,
> so lost type information would never be able to be recovered for these types.
> This would make certain code patterns and transformations incorrect only for these types,
> so they may be more trouble than they are worth.

In addition to the above rules,
we also restrict `describes` and `descriptor` clauses
to appear only on struct type definitions.
This may be relaxed in the future.

```wasm
(rec
  ;; Invalid: descriptor clauses may only be used with structs.
  (type $array (descriptor $array.rtt (array i8)))

  ;; Invalid: describes clauses may only be used with structs.
  (type $array.rtt (describes $array (func)))
)
```

## Exact Types

Allocating an instance of a type with a custom descriptor necessarily
requires supplying a custom descriptor value.
Specified naively,
this could allow the following unsound program to validate and run:

```wasm
(rec
  (type $foo (sub (descriptor $foo.rtt (struct))))
  (type $foo.rtt (sub (describes $foo (struct))))

  (type $bar (sub $foo (descriptor $bar.rtt (struct (field $bar-only i32)))))
  (type $bar.rtt (sub $foo.rtt (describes $bar (struct))))
)

(func $unsound (result i32)
  (local $rtt (ref $foo.rtt))
  ;; We can store a $bar.rtt in the local due to subtyping.
  (local.set $rtt (struct.new $bar.rtt))
  ;; Allocate a $foo with a $foo.rtt that is actually a $bar.rtt.
  (struct.new $foo (local.get $rtt))
  ;; Now cast the $foo to a $bar. This will succeed because it has an RTT for $bar.
  (ref.cast (ref $bar))
  ;; Out-of-bounds read.
  (struct.get $bar $bar-only)
)
```

The problem here is that the normal subtyping rules make it possible
to allocate a `$foo` with an RTT for `$bar`,
causing subsequent casts to behave incorrectly.
One solution would be to have `struct.new` dynamically check that the provided descriptor value
describes precisely the allocated type.
A better solution would be to allow userspace to perform that check if necessary,
but also be able to statically prove via the type system that it is not necessary.

To facilitate that we introduce exact heap types,
which are subtypes of their base heap types
but not supertypes of their base heap types' declared subtypes.

```
heaptype ::= absheaptype | exact typeidx | typeidx
```

The subtyping rules for heap types are extended:


```
C |- (exact typeidx_1) <: typeidx_1

```

Notably, by the existing, unmodified rules for `none`, `nofunc`, etc.
it is the case that e.g. `none <: (exact $some_struct)`.
Given these types:

```
(type $super (sub (struct)))
(type $sub (sub $super (struct)))
```

We have the following relationships:

```
none <: (exact $sub) <: $sub <: $super <: struct <: eq <: any
(exact $super) <: $super <: ...
```

But no version of `$sub` is in a subtyping relation with `(exact $super)`.


All instructions that create references to a particular defined heap type
(e.g. `ref.func`, `struct.new`, `array.new`,  etc.)
are refined to produce references to the exact version of that heap type.

Since only defined types have exact versions,
instructions like `ref.i31` or `any.convert_extern` that produce
references to abstract heap types do not produce references to exact types.

When allocating types with custom descriptors,
`struct.new` and `struct.new_default` take references to the exact descriptors
as their last operands.
This makes the unsound program above invalid.

```
struct.new x

C |- struct.new x : t* (ref null (exact y)) -> (ref (exact x))
 -- C.types[x] ~ descriptor y (struct (field t)*)
```

```
struct.new_default x

C |- struct.new_default x : (ref null (exact y)) -> (ref (exact x))
 -- C.types[x] ~ descriptor y (struct (field t)*)
 -- defaultable(t)*
```

> Note: The descriptors could alternatively be the first operands.
> They are chosen to be the last operands here because in a hypothetical future
> where we have variants of these instructions that do not take type immediates,
> the descriptors would have to be on top of the stack to determine the type of
> the allocation. This is consistent with GC accessor instructions.

## New Instructions

Given a reference to a type with a custom descriptor,
a reference to the custom descriptor value can be retrieved with `ref.get_desc`.

```
ref.get_desc typeidx

C |- ref.get_desc x : (ref null (exact_1 x)) -> (ref (exact_1 y))
-- C.types[x] ~ descriptor y ct
```

If the provided reference is to an exact heap type,
then the type of the custom descriptor is known precisely,
so the result can be exact as well.
Otherwise, the subtyping rules described above ensure that there will be some custom descriptor value
and that it will be a subtype of the custom descriptor type for `x`,
so the result can be a non-null reference to the inexact descriptor type.

Being able to retrieve a custom descriptor means you can then compare it for equality
with an expected custom descriptor value.
If the values are equal,
that lets you reason about the type of the value the custom descriptor was attached to.
But the type system cannot make those logical deductions on its own,
so to help it out we introduce a new set of cast instructions that take custom descriptors
as additional operands.
These instructions compare the descriptor of the provided reference with the provided descriptor,
and if they match,
return the provided reference with the type described by the descriptor.
If the type of the descriptor is exact,
then the type of the cast output can also be exact.

```
ref.cast_desc reftype

C |- ref.cast_desc rt : (ref null ht) (ref null (exact_1 y)) -> rt
-- rt = (ref null? (exact_1 x))
-- C |- C.types[x] <: ht
-- C.types[x] ~ descriptor y ct
```

```
br_on_cast_desc labelidx reftype reftype

C |- br_on_cast_desc l rt_1 rt_2 : t* rt_1 (ref null (exact_1 y)) -> t* (rt_1 \ rt_2)
-- C.labels[l] = t* rt
-- C |- rt_2 <: rt
-- C |- rt_2 <: rt_1
-- rt_2 = (ref null? (exact_1 x))
-- C.types[x] ~ descriptor y ct
```

```
br_on_cast_desc_fail labelidx reftype reftype

C |- br_on_cast_desc_fail l rt_1 rt_2 : t* rt_1 (ref null (exact_1 y)) -> t* rt_2
-- C.labels[l] = t* rt
-- C |- rt_1 \ rt_2 <: rt
-- C |- rt_2 <: rt_1
-- rt_2 = (ref null? (exact_1 x))
-- C.types[x] ~ descriptor y ct
```

## JS Prototypes

In JS engines,
WebAssembly RTTs correspond to JS shape descriptors.
Custom descriptors act as first-class handles to the engine-managed RTTs,
so they can serve as extension points for the JS reflection of the Wasm objects they describe,
and in particular they can allow JS prototypes to be associated with the described objects.
To make this work, we allow information about the intended JS reflection of Wasm objects
to be imported into a Wasm module and held by custom descriptors.
The `[[GetPrototypeOf]]` algorithm for a WebAssembly object can then look up this information
on the object's custom descriptor. The details of how this works are described below.

We introduce a new `WebAssembly.DescriptorOptions` type
that holds relevant information about the JS reflection of Wasm objects.
A `DescriptorOptions` is constructed with an option bag containing
an object to be used as a prototype. Other options may be added in the future,
for example to expose Wasm struct fields as own properties.

```webidl
dictionary DescriptorOptionsOptions {
  object? prototype;
};

[LegacyNamespace=WebAssembly, Exposed=*]
interface DescriptorOptions {
  constructor(DescriptorOptionsOptions options);
}
```

A `DescriptorOptions` object has a `[[WebAssemblyDescriptorOptions]]`
internal slot with the value `true`.
This allows it to be identified by the `[[GetPrototypeOf]]` algorithm.
Its constructor copies all of the options into the constructed `DescriptorOptions`.

The specification of the `[[GetPrototypeOf]]` internal method
of an Exported GC Object `O` is updated to perform the following steps
(which will be made more precise in the final spec):

 1. If `O.[[ObjectKind]]` is not "struct":
   1. Return `null`.
 1. Let `store` be the surrounding agent's associated store
 1. Look up the object's heap type from the store.
 1. If the heap type does not have a descriptor clause:
   1. Return `null`.
 1. Get the descriptor value and descriptor type.
 1. If the descriptor type has has no fields or its first field is not immutable or does not match `externref`:
   1. Return `null`.
 1. Get the value `v` of the first field.
 1. Let `u` be `ToJSValue(v)`.
 1. If `u` does not have a `[[WebAssemblyDescriptorOptions]]` internal slot:
   1. Return `null`.
 1. Return the prototype stored in `u`.

> Note: it would also be good to ensure a `DescriptorOptions` is opaque and can
> only be used once to avoid having to keep the configuration data live for the
> lifetime of the custom descriptor. TODO.

The only new capability required in the WebAssembly embedding interface is the
ability to inspect a reference's heap type.
The algorithm also needs to access the value's descriptor and its fields,
but in principle it could do that by synthesizing a new Wasm instance
exporting the functions necessary to perform that access,
so those would not be fundamentally new capabilities.

The following is a full example that uses `WebAssembly.DescriptorOptions`
to allow JS to call `get()` and `inc()` methods on counter objects implemented in
WebAssembly.

```wasm
;; counter.wasm
(module
  (rec
    (type $counter (descriptor $counter.vtable (struct (field $val i32))))
    (type $counter.vtable (describes $counter (struct
      (field $proto (ref extern))
      (field $get (ref $get_t))
      (field $inc (ref $inc_t))
    )))
    (type $get_t (func (param (ref null $counter)) (result i32)))
    (type $inc_t (func (param (ref null $counter))))
  )

  (import "env" "counter.proto" (global $counter.proto (ref extern)))

  (elem declare func $counter.get $counter.inc)

  (global $counter.vtable (ref (exact $counter.vtable))
    (struct.new $counter.vtable
      (global.get $counter.proto)
      (ref.func $counter.get)
      (ref.func $counter.inc)
    )
  )

  (global $counter (export "counter") (ref $counter)
    (struct.new_default $counter
      (global.get $counter.vtable)
    )
  )

  (func $counter.get (export "counter.get") (type $get_t) (param (ref null $counter)) (result i32)
    (struct.get $counter $val (local.get 0))
  )

  (func $counter.inc (export "counter.inc") (type $inc_t) (param (ref null $counter))
    (struct.set $counter $val
      (local.get 0)
      (i32.add
        (struct.get $counter $val (local.get 0))
        (i32.const 1)
      )
    )
  )
)
```

```js
// counter.js

var counterProto = {};

var counterOpts = new WebAssembly.DescriptorOptions({
  prototype: counterProto
});

var {module, instance} = await WebAssembly.instantiateStreaming(fetch('counter.wasm'), {
  env: {
    "counter.proto": counterOpts
  }
});

counterProto.get = function() { return instance.exports['counter.get'](this); };
counterProto.inc = function() { instance.exports['counter.inc'](this); };

var counter = instance.exports['counter'];

console.log(counter.get()); // 0
counter.inc();
console.log(counter.get()); // 1
```

> Note: Other API designs are also possible.
> See the discussion at https://github.com/WebAssembly/custom-rtts/issues/2.

## Declarative Prototype Initialization

We expect toolchains to need to configure thousands of JS prototypes and tens of thousands of methods,
so we expect there to be startup latency problems
if all the configuration is done directly via the raw `DescriptorOptions` API
and JS glue code as shown above.

The proposed solution is to provide a declarative method of constructing, importing,
and populating the `DescriptorOptions` objects.

The declarative API must support these features:

 - Constructing new prototype objects
 - Using existing prototype objects provided at instantiation time
 - Creating prototype chains
 - Synthesizing and attaching methods (including getters and setters) to prototypes

Furthermore, the design goals are to be:

 - Polyfillable by generated JS glue using the underlying `DescriptorOptions` JS API,
   i.e. to not introduce any new expressivity.

We define such an API in the form of a new custom section to be specified as part of the JS embedding.
This custom section will be used in the constructor of `WebAssembly.Instance`
to populate the imports with additional `DescriptorOptions` before core instantiation
and to populate the prototypes using exported functions after core instantiation.

### Custom Section

```
descindex       ::= u32

descriptorsec   ::= section_0(descriptordata)

descriptordata  ::= n:name (if n = 'descriptors')
                    modulename:name
                    vec(descriptorentry)

descriptorentry ::= 0x00 importentry
                  | 0x01 declentry

importentry     ::= importname:name descconfig

declentry       ::= protoconfig descconfig

protoconfig     ::= v:vec(descindex) (if |v| <= 1)

descconfig      ::= exportnames vec(methodconfig)

exportnames     ::= vec(name)

methodconfig    ::= kind:methodkind
                    methodname:name
                    exportname:name

methodkind      ::= 0x00 => method
                  | 0x01 => getter
                  | 0x02 => setter
                  | 0x03 => constructor
```

The descriptors custom section starts with `modulename`,
which is the module name from which the configured `DescriptorOptions` values
will be imported by the Wasm module.
A module may import configured `DescriptorOptions` values
from multiple different module names
by including multiple descriptors sections.

Following the `modulename` is a sequence of `descriptorentry`,
each of which describes a single `DescriptorOptions` value.
Each value can either be imported,
meaning that it is provided as an argument to instantiation,
or it is declared,
meaning that the instantiation procedure will create it.
A declared value can optionally specify the index of a previous value
to serve as the parent in the configured prototype chain.
Imported values are assumed to already have their prototype chain configured.

Each configured descriptor has a vector of export names.
These are the names from which the Wasm module will import the descriptor values.

Whether imported or declared,
each `descriptorentry` contains a vector of `methodconfig`
describing the methods that should be attached to the prototype
after instantiation.
Each configured method can be either a
normal method, a getter, a setter, or a constructor.
Methods also have two associated names: the first their property name
in the configured prototype and the second
the name of the exported function they wrap.

All methods pass the receiver as the first argument:

```js
function methodname() { return exports[exportname](this, ...arguments); }
```

Getters and setters are additionally configured as getters and setters
when they are attached to the prototype.

Constructors are a little different.
They do not pass the receiver as a parameter to the exported function:

```js
function methodname() { return exports[exportname](...arguments); }
```

Furthermore, they are not installed on the configured prototype.
Instead, they are added to the `exports` object.
The configured prototype is added as the `prototype` property of the generated function
and the generated function is added as the `constructor` property of the configured prototype.

### Instantiation

When constructing a WebAssembly instance,
the descriptors sections are first processed
to create any new declared `DescriptorOptions`.
Descriptor values imported by these sections are read from the main imports
argument passed to instantiation using the module names
given at the beginning of the sections.

The imports for core Wasm instantiation are then determined,
giving precedence to the exports from the descriptors sections.

After core instantiation,
the methods are populated based on the core exports.
Since this does not happen until after core instantiation,
when the exports have been made available,
imports called by the start function will be able to observe
the unpopulated prototypes that do not yet have the method properties.

If there is a decoding error in a descriptors section
or if at any point a required import or export is missing,
an error will be thrown.

> TODO: Describe the effect of the descriptors section on Module.imports and Module.exports.

## Type Section Field Deduplication

TODO

## Binary Format

### Describes and Desciptor Clauses

In the formal syntax,
we insert optional descriptor and describes clauses between `comptype` and `subtype`.
(Sharedness from the shared-everything-threads proposal goes outside these new clauses,
and is included below only to clarify the interaction between proposals.)

```
describedcomptype ::=
  | 0x4D x:typeidx ct:comptype => (descriptor x ct)
  | ct:comptype => ct

describingcomptype ::=
  | 0x4C x:typeidx ct:describedcomptype => (describes x ct)
  | ct:describedcomptype => ct

sharecomptype ::=
  | 0x65 ct:describingcomptype => (shared ct)
  | ct:describingcomptype => ct

subtype ::=
  | 0x50 x*:vec(typeidx) ct:sharecomptype => sub x* ct
  | 0x4F x*:vec(typeidx) ct:sharecomptype => sub final x* ct
  | ct:sharecomptype => sub final eps ct
```

### Exact Types

Exact heap types are introduced with a prefix byte:

```
heaptype :: ... | 0x62 x:u32 => exact x
```

Note that the type index being encoded as a `u32` instead of an `s33`
intentionally makes it impossible to encode an exact abstract heap type.

### Instructions

All existing instructions that take heap type immediates work without
modification with the encoding of exact heap types.

The new instructions are encoded as follows:

```
instr ::= ...
  | 0xFB 34:u32 x:typeidx => ref.get_desc x
  | 0xFB 35:u32 ht:heaptype => ref.cast_desc (ref ht)
  | 0xFB 36:u32 ht:heaptype => ref.cast_desc (ref null ht)
  | 0xFB 37:u32 (null_1?, null_2?):castflags
        l:labelidx ht_1:heaptype ht_2:heaptype =>
      br_on_cast_desc l (ref null_1? ht_1) (ref null_2? ht_2)
  | 0xFB 38:u32 (null_1?, null_2?):castflags
        l:labelidx ht_1:heaptype ht_2:heaptype =>
      br_on_cast_desc_fail l (ref null_1? ht_1) (ref null_2? ht_2)
```
