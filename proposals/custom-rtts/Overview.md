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

## Exact Reference Types

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

To facilitate that we introduce exact reference types,
which are inhabited by references to a particular heap type (and possibly the null value),
but not any of the heap type's strict subtypes.

Exact reference types can be nullable with the form `(ref null exact ht)`
or non-nullable with the form `(ref exact ht)`.

For any heap type `ht`:

```
(ref ht) <: (ref null ht)
(ref null exact ht) <: (ref null ht)
(ref exact ht) <: (ref ht)
(ref exact ht) <: (ref null exact ht)
```

Furthermore, to ensure that each type hierarchy remains a lattice,
we have:

```
(ref null exact bot) <: (ref null exact ht)
(ref exact bot) <: (ref exact ht)
```

where `bot` is the bottom type
(e.g. `none`, `nofunc`, `noextern`, `noexnt`, or `nocont`) of `ht`'s hierarchy.

All instructions that create reference to a particular heap type
(e.g. `ref.func`, `struct.new`, `array.new`, `ref.i31`, `ref.null`,  etc.)
are refined to produce exact references to that heap type.
In contrast, `any.convert_extern` and `extern.convert_any` never produce exact references.
`(ref exact any)` and `(ref exact extern)` are uninhabited.
Internalized host references and externalized internal references are modeled
as having "hidden" subtypes of `any` and `extern`,
respectively.
This preserves our ability to assign them more specific types in the future.

When allocating types with custom descriptors,
`struct.new` and `struct.new_default` take exact references to the descriptors
as their first operands.
This makes the unsound program above invalid.

> TODO: Provide new validation rules for `struct.new` and `struct.new_default`.

## New Instructions

Given a reference to a type with a custom descriptor,
a reference to the custom descriptor value can be retrieved with `ref.get_desc`.

```
ref.get_desc typeidx

C |- ref.get_desc x : (ref exact_1 null x) -> (ref exact_1 y)
-- C.types[x] ~ descriptor y ct
```

If the provided reference is exact,
then the type of the custom descriptor is known precisely,
so the result can be exact as well.
Otherwise, the subtyping rules described above ensure that there will be some custom descriptor value
and that it will be a subtype of the custom descriptor type for `x`,
so the result can be a non-null inexact reference.

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

C |- ref.cast_desc rt : (ref null ht) (ref null exact_1 y) -> rt
-- rt = (ref null? exact_1 x)
-- C |- C.types[x] <: ht
-- C.types[x] ~ descriptor y ct
```

```
br_on_cast_desc labelidx reftype reftype

C |- br_on_cast_desc l rt_1 rt_2 : t* rt_1 (ref null exact_1 y) -> t* (rt_1 \ rt_2)
-- C.labels[l] = t* rt
-- C |- rt_2 <: rt
-- C |- rt_2 <: rt_1
-- rt_2 = (ref null? exact_1 x)
-- C.types[x] ~ descriptor y ct
```

```
br_on_cast_desc_fail labelidx reftype reftype

C |- br_on_cast_desc_fail l rt_1 rt_2 : t* rt_1 (ref null exact_1 y) -> t* rt_2
-- C.labels[l] = t* rt
-- C |- rt_1 \ rt_2 <: rt
-- C |- rt_2 <: rt_1
-- rt_2 = (ref null? exact_1 x)
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
 1. If the descriptor type has no immutable fields with types that match `externref`:
   1. Return `null`.
 1. Get the value `v` of the first immutable field that matches `externref`.
 1. Let `u` be `ToJSValue(v)`.
 1. If `u` does not have a `[[WebAssemblyDescriptorOptions]]` internal slot:
   1. Return `null`.
 1. Return the prototype stored in `u`.

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

  (global $counter.vtable (ref exact $counter.vtable)
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

TODO

## Type Section Field Deduplication

TODO

## Binary Format

### Describes and Desciptor Clauses

In the formal syntax,
we insert optional descriptor and describes clauses between `comptype` and `subtype`.
(Sharedness from the shared-everything-threads proposal goes outside these new clauses,
and is included below only to clarify the interaction between proposals.)

```
descriptorcomptype ::=
  | 0x4D x:typeidx ct:comptype => (descriptor x ct)
  | ct:comptype => ct

describescomptype ::=
  | 0x4C x:typeidx ct:descriptorcomptype => (describes x ct)
  | ct:descriptorcomptype => ct

sharecomptype ::=
  | 0x65 ct:describescomptype => (shared ct)
  | ct:describescomptype => ct

subtype ::=
  | 0x50 x*:vec(typeidx) ct:sharecomptype => sub x* ct
  | 0x4F x*:vec(typeidx) ct:sharecomptype => sub final x* ct
  | ct:sharecomptype => sub final eps ct
```

### Exact Reference Types

Rather than use two new opcodes in the type opcode space
to represent nullable and non-nullable exact reference types,
we introduce just a single new prefix opcode that encode both:

```
reftype :: ...
  | 0x62 0x64 ht:heaptype => ref exact ht
  | 0x62 0x63 ht:heaptype => ref null exact ht
```

To make the most of the existing shorthands for nullable abstract heap types,
we also allow using the exact prefix with those shorthands:

```
reftype :: ...
  | 0x62 ht:absheaptype => ref null exact ht
```

Similarly, we allow combining `exact` with the established shorthands in the text format.
For example `(exact anyref)` is a shorthand for `(ref null exact any)`.

### Instructions

The existing `ref.test`, `ref.cast`, `br_on_cast` and `br_on_cast_fail` instructions
need to be able to work with exact reference types.
`ref.test` and `ref.cast` currently have two opcodes each:
one for nullable target types and one for non-nullable target types.
Rather than introducing two new opcodes for each of these instructions
to allow for nullable exact and non-nullable exact target types,
we introduce one new opcode for each that takes a full reference type
rather than a heap type as its immediate.

```
instr ::= ...
  | 0xFB 32:u32 rt:reftype => ref.test rt
  | 0xFB 33:u32 rt:reftype => ref.cast rt
```

(`0xFB 31` is already used by `ref.i31_shared` in the shared-everything-threads proposal.)

Note that these new encodings can be used instead of the existing encodings
to represent casts to inexact reference types.

> Note: We could alternatively restrict the new encoding to be usable only with exact types,
> but this artificial restriction does not seem useful.

> Note: We could alternatively continue the existing encoding scheme,
> at the cost of using 4 new opcodes instead of 2.

`br_on_cast` and `br_on_cast_fail` already encode the nullability of their
input and output types in a "castflags" u8 immediate. Castflags is extended to encode
exactness as well:

```
castflags ::= ...
  | 4:u8 => (exact, eps)
  | 5:u8 => (null exact, eps)
  | 6:u8 => (exact, null)
  | 7:u8 => (null exact, null)
  | 8:u8 => (eps, exact)
  | 9:u8 => (null, exact)
  | 10:u8 => (eps, null exact)
  | 11:u8 => (null, null exact)
  | 12:u8 => (exact, exact)
  | 13:u8 => (null exact, exact)
  | 14:u8 => (exact, null exact)
  | 15:u8 => (null exact, null exact)
```

Note that the bits now have the following meanings:

```
bit 0: source nullability
bit 1: target nullability
bit 2: source exactness
bit 3: target exactness
```

The other new instructions are encoded as follows:

```
instr ::= ...
  | 0xFB 34:u32 x:typeidx => ref.get_desc x
  | 0xFB 35:u32 rt:reftype => ref.cast_desc reftype
  | 0xFB 36:u32 (null_1? exact_1?, null_2? exact_2?):castflags
        l:labelidx ht_1:heaptype ht_2:heaptype =>
      br_on_cast_desc l (ref null_1? exact_1? ht_1) (ref null_2? exact_2? ht_2)
  | 0xFB 37:u32 (null_1? exact_1?, null_2? exact_2?):castflags
        l:labelidx ht_1:heaptype ht_2:heaptype =>
      br_on_cast_desc_fail l (ref null_1? exact_1? ht_1) (ref null_2? exact_2? ht_2)
```

## Minimal Initial Prototyping for JS Interop

A truly minimal prototype for experimenting with JS interop can skip
implementing most of the new features in this proposal:

 - Arbitrary fields on custom descriptors.
   A minimal prototype can allow `descriptor` clauses only on empty structs.
 - Exact reference types.
   A minimal prototype can instead bake an RTT exactness check into the
   semantics of `struct.new` and `struct.new_default` to ensure soundness.
 - New instructions.
   A minimal prototype only needs to update `struct.new` and `struct.new_default`
   to take references to custom descriptors as necessary.
   It does not need to implement `ref.get_desc` or any of the new casts.
