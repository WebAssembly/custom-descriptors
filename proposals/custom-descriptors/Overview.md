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
  (type $foo (descriptor $foo.rtt) (struct (field ...)))
  (type $foo.rtt (describes $foo) (struct (field ...)))
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
  (type $A (descriptor $A.rtt) (struct (field i32)))
  (type $A.rtt (describes $A) (struct (field i32)))
)

(rec
  (type $B (descriptor $B.rtt) (struct (field i32)))
  (type $B.rtt (describes $B) (struct (field i32)))
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
  (type $foo (descriptor $foo.rtt) (struct))
  (type $foo.rtt (describes $foo) (descriptor $foo.meta-rtt) (struct))
  (type $foo.meta-rtt (describes $foo.rtt) (struct))
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
  (type $B (descriptor $C) (struct))
  (type $C (describes $A) (struct)) ;; Invalid: must be 'describes $B'
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
  (type $self (describes $self) (descriptor $self) (struct))

  ;; Invalid describes clause: $pong is not a previously defined type.
  (type $ping (describes $pong) (descriptor $pong) (struct))
  (type $pong (describes $ping) (descriptor $ping) (struct))

  ;; Invalid describes clause: $foo is not a previously defined type.
  (type $foo.rtt (describes $foo) (struct))
  (type $foo (descriptor $foo.rtt) (struct))
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

 - A declared supertype of a type with a `(describes $x)` clause
   must have a `(describes $y)` clause,
   where `$y` is a declared supertype of `$x`.

 - A declared supertype of a type without a `describes` clause must also
   not have a `describes` clause.

 - With shared-everything-threads,
   a shared described type must have a shared descriptor type and vice versa,
   and an unshared described type must have an unshared descriptor type and vice versa.
   > Note: this could be relaxed to allow unshared described types to have shared descriptor types
   > (but not vice versa) if there is demand for this in the future.

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
  (type $super (sub (descriptor $super.rtt) (struct)))
  (type $super.rtt (sub (describes $super) (struct)))

  ;; Ok
  (type $sub (sub $super (descriptor $sub.rtt) (struct)))
  (type $sub.rtt (sub $super.rtt (describes $sub) (struct)))
)

(rec
  (type $super (sub (struct)))

  ;; Ok
  (type $sub (sub $super (descriptor $sub.rtt) (struct)))
  (type $sub.rtt (describes $sub) (struct))
)

(rec
  (type $super (sub (descriptor $super.rtt) (struct )))
  (type $super.rtt (sub (describes $super) (struct)))

  (type $other (descriptor $sub.rtt) (struct))

  ;; Invalid: Must describe an immediate subtype of $super.
  (type $sub.rtt (sub $super.rtt (describes $other) (struct)))
)

(rec
  (type $super (sub (descriptor $super.rtt) (struct)))
  (type $super.rtt (sub (describes $super) (struct)))

  ;; Invalid: Must be described by an immediate subtype of $super.rtt.
  (type $sub (sub $super (struct)))

  ;; Invalid: Must describe an immediate subtype of $super.
  (type $sub.rtt (sub $super.rtt (struct)))
)

(rec
  (type $super (sub (descriptor $super.rtt) (struct)))
  (type $super.rtt (sub (describes $super) (struct)))

  ;; Invalid: $other.rtt must be a an immediate subtype of $super.rtt.
  (type $sub (sub $super (descriptor $other.rtt) (struct)))
  (type $other.rtt (describes $sub) (struct))
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
  (type $array (descriptor $array.rtt) (array i8))

  ;; Invalid: describes clauses may only be used with structs.
  (type $array.rtt (describes $array) (func))
)
```

## Exact Types

Allocating an instance of a type with a custom descriptor necessarily
requires supplying a custom descriptor value.
Specified naively,
this could allow the following unsound program to validate and run:

```wasm
(rec
  (type $foo (sub (descriptor $foo.rtt) (struct)))
  (type $foo.rtt (sub (describes $foo) (struct)))

  (type $bar (sub $foo (descriptor $bar.rtt) (struct (field $bar-only i32))))
  (type $bar.rtt (sub $foo.rtt (describes $bar) (struct)))
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

### Exact Function Imports

Consider this module:

```wasm
(module $A
  (type $super (sub (func)))
  (type $sub (sub $super (func)))

  (import "B" "f" (func $f (type $super)))

  (global (export "f") (ref (exact $super)) (ref.func $f))
)
```

This module imports a function `$f` of type `$super`,
then exports a reference to it with type `(ref (exact $super))`.
According to the rules given above,
this is fine because `ref.func` returns exact references.
But this is unsound!
The function `B.f` supplied at instantiation time might actually
have been of type `$sub`.
In that case it would be incorrect to type a reference to the function
as `(exact $super)`,
because in fact the reference would be to a `$sub`.

A simple solution to this problem would be
to type references to imported functions as inexact.
This would be sound,
but it would not be modular enough because it would
create a difference in expressivity between imported and defined functions.
The latter would be able to be referenced exactly and the former would not.
This would inhibit e.g. module splitting
where the secondary module contains a function that takes an exact reference
to a function imported from the primary module.
This would work before splitting the function definitions into separate modules,
but not afterward.

To support this use case,
we must make it possible to take exact references to imported functions.
But for that to be sound,
we must ensure that such imported functions have exactly the referenced type.
Function imports already give a type for the imported function;
we must now make it possible for that type to be exact.

The external type of a function import is currently represented as a `typeuse`,
so we can just make it a pair of `exact` and `typeuse`:

```
externtype ::= ... | func exact? heaptype
```

In the text format,
function import types are given by `typeuse` and its associated sugar.
We don't want to allow exactness everywhere `typeuse`
appears in the text format,
so instead of extending the syntax of `typeuse`,
we introduce a new production, `exacttypeuse`.

```
exacttypeuse ::= '(' 'exact' ut:typeuse ')' => exact ut
               | ut:typeuse                 => inexact ut
```

Function imports, including all their sytax sugars,
are updated to use `exacttypeuse` in place of `typeuse`.
For example:

```wasm
(module
  (type $f (func))
  (import "" "" (func (exact (type $f))))
  (import "" "" (func (exact (type $f) (param) (result))))
  (import "" "" (func (exact (type 1)))) ;; Implicitly defined next
  (import "" "" (func (exact (param i32) (result i64))))

  (func (import "" "") (exact (type $f)))
  (func (import "" "") (exact (type $f) (param) (result)))
  (func (import "" "") (exact (type 2))) ;; Implicitly defined next
  (func (import "" "") (exact (param i64) (result i32)))
)

```

## New Instructions

Given a reference to a type with a custom descriptor,
a reference to the custom descriptor value can be retrieved with `ref.get_desc`.

```
ref.get_desc typeidx

C |- ref.get_desc x : (ref null (exact_1 x)) -> (ref (exact_1 y))
-- C.types[x] ~ descriptor y ct
```

If the provided reference is to the exact accessed heap type `x`,
then the type of the custom descriptor is known to be exactly `x`'s descriptor type.
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

If the provided descriptor is a null value, these instructions trap.

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
-- C |- rt_1 <: rt'
-- C |- rt_2 <: rt'
-- C |- rt' : ok
-- rt_2 = (ref null? (exact_1 x))
-- C.types[x] ~ descriptor y ct
```

```
br_on_cast_desc_fail labelidx reftype reftype

C |- br_on_cast_desc_fail l rt_1 rt_2 : t* rt_1 (ref null (exact_1 y)) -> t* rt_2
-- C.labels[l] = t* rt
-- C |- rt_1 \ rt_2 <: rt
-- C |- rt_1 <: rt'
-- C |- rt_2 <: rt'
-- C |- rt' : ok
-- rt_2 = (ref null? (exact_1 x))
-- C.types[x] ~ descriptor y ct
```

Note that the constraint `C |- rt_2 <: rt_1` on branching cast instructions before this proposal
is relaxed to the constraint that `rt_1` and `rt_2` share some arbitrary valid supertype `rt'`,
i.e. that `rt_1` and `rt_2` must be in the same heap type hierarchy.
This relaxation is applied not only to the new `br_on_cast_desc` and `br_on_cast_desc_fail` instructions,
but also the existing `br_on_cast` and `br_on_cast_fail` instructions.

## JS Prototypes

In JS engines,
WebAssembly RTTs correspond to JS shape descriptors.
Custom descriptors act as first-class handles to the engine-managed RTTs,
so they can serve as extension points for the JS reflection of the Wasm objects they describe,
and in particular they can allow JS prototypes to be associated with the described objects.
To make this work, we allow information about the intended JS reflection of Wasm objects
to be imported into a Wasm module and held by custom descriptors.
The `[[GetPrototypeOf]]` algorithm for a WebAssembly object can then look up this information
on the object's custom descriptor.

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
 1. If `u` is a JS object:
     1. return `u`.
 1. Return `null`.

> Note: If we need to configure more than just the prototype
> (e.g. own properties)
> we could add a `WebAssembly.DescriptorOptions` object
> that contains the prototype and additional configuration.

The only new capability required in the WebAssembly embedding interface is the
ability to inspect a reference's heap type.
The algorithm also needs to access the value's descriptor and its fields,
but in principle it could do that by synthesizing a new Wasm instance
exporting the functions necessary to perform that access,
so those would not be fundamentally new capabilities.

The following is a full example that allows JS
to call `get()` and `inc()` methods on counter objects implemented in
WebAssembly.

```wasm
;; counter.wasm
(module
  (rec
    (type $counter (descriptor $counter.vtable) (struct (field $val (mut i32))))
    (type $counter.vtable (describes $counter) (struct
      (field $proto (ref extern))
      (field $get (ref $get_t))
      (field $inc (ref $inc_t))
    ))
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

var {module, instance} = await WebAssembly.instantiateStreaming(fetch('counter.wasm'), {
  env: {
    "counter.proto": counterProto
  }
});

counterProto.get = function() { return instance.exports['counter.get'](this); };
counterProto.inc = function() { instance.exports['counter.inc'](this); };

var counter = instance.exports['counter'].value;

console.log(counter.get()); // 0
counter.inc();
console.log(counter.get()); // 1
```

## Declarative Prototype Initialization

We expect toolchains to need to configure thousands of JS prototypes and tens of thousands of methods,
so we expect there to be startup latency problems
if all the configuration is done directly via the kind of
JS glue code as shown above.

The proposed solution is to provide a declarative method of constructing, importing,
and populating the prototype objects.

The declarative API must support these features:

 - Constructing new prototype objects
 - Using existing prototype objects provided at instantiation time
 - Creating prototype chains
 - Synthesizing and attaching methods (including getters and setters) to prototypes

Furthermore, the design goals are to be:

 - Polyfillable by generated JS glue,
   i.e. to not introduce any new expressivity.

We define such an API in the form of a new compile-time import
similar to the JS string builtins.
This new builtin can be called from the start function to populate
imported prototypes.

### Configuration API

The name of the new builtin module is `"wasm:js-prototypes"`.
It is enabled by including `"js-prototypes"` in the `builtins` option list
passed to `WebAssembly.compile` and other functions that take `compileOptions`.

The new builtin module contains one function, `"configureAll"`.
This function has type `$configureAll` as described below:

```wasm
(type $prototypes (array (mut externref)))
(type $functions (array (mut funcref)))
(type $data (array (mut i8)))
(type $configureAll (func (param (ref null $prototypes))
                          (param (ref null $functions))
                          (param (ref null $data))
                          (param externref)))
```

The first parameter is an array of imported prototypes to be configured.

The second parameter is an array of functions to be installed as methods and constructors.

The third parameter is an array of bytes encoding how the functions should be installed.

The last parameter is an object on which the configured constructors will be installed,
since they cannot be added to the module's exports object.

The configuration data is interpreted according to this grammar:

```
data ::= vec(protoconfig)

protoconfig ::= vec(constructorconfig) (with size <= 1)
                vec(methodconfig)
                parentidx

constructorconfig ::= constructorname:name
                      vec(methodconfig)

methodconfig ::= 0x00 name ;; method
               | 0x01 name ;; getter
               | 0x02 name ;; setter

parentidx ::= s32 ;; -1 for no parent, otherwise parent index
```

The function `configureAll` parses this data stream
and consumes elements of the "prototypes" and "functions" array in order.
Each time it moves on to the next `protoconfig`,
it takes the next entry in the "prototypes" array as the current prototype;
each time it moves on to the next `constructorconfig` or `methodconfig`,
it takes the next entry in the "functions" array as the current function.

If a `protoconfig` has a `constructorconfig`,
the current function is wrapped
to be able to be optionally called with `new` in JS.
The wrapper is set as the current constructor,
installed as the "constructor" property of the current prototype,
and installed with the given name on the constructors object.

For each `methodconfig` inside a `constructorconfig`,
the current function is installed with the given name and type
(method, getter, or setter)
on the current constructor.
The function is not wrapped or modified in any way,
and in particular it does not receive a method receiver as its first parameter.

For each top-level `methodconfig` inside a `protoconfig`,
`configureAll` wraps the current function
to take its JS-side receiver as its Wasm-side first parameter.
The wrapper is installed with the given name and type
on the current prototype.

If the `protoconfig` has a `parentidx` other than -1,
the prototype of the current prototype
is set to the object at the given index in the prototypes array.
The index must be less than the current prototype index
and the parent prototype must be a valid prototype,
i.e. it must be a JS object or null.

Errors are detected lazily,
so user-visible partial modifications may have occured
before an error is thrown.
Errors messages should include the relevant index into the data array.

> TODO: Detail the thrown errors.

> TODO: The wrappers for making a function callable with `new`
> and for taking the receiver as a first parameter should be separated out into
> their own user-facing APIs.

### Usage

Although `configureAll` can be called at any point during execution,
it is expected to be called by the start function as part of instantiation.
Here is the counter module from before, updated to use `configureAll`
and additionally expose a constructor:

```wasm
;; counter.wasm

(module
  (rec
    (type $counter (descriptor $counter.vtable) (struct (field $val (mut i32))))
    (type $counter.vtable (describes $counter) (struct
      (field $proto (ref extern))
      (field $get (ref $get_t))
      (field $inc (ref $inc_t))
    ))
    (type $get_t (func (param (ref null $counter)) (result i32)))
    (type $inc_t (func (param (ref null $counter))))
  )
  (type $new_t (func (param i32) (result (ref $counter))))

  ;; Types for prototype configuration
  (type $prototypes (array (mut externref)))
  (type $functions (array (mut funcref)))
  (type $data (array (mut i8)))
  (type $configureAll (func (param (ref null $prototypes))
                            (param (ref null $functions))
                            (param (ref null $data))
                            (param externref)))

  (import "protos" "counter.proto" (global $counter.proto (ref extern)))

  ;; The object where configured constructors will be installed.
  (import "env" "constructors" (global $constructors externref))

  (import "wasm:js-prototypes" "configureAll"
    (func $configureAll (type $configureAll)))

  ;; Segments used to create arrays passed to $configureAll
  (elem $prototypes externref
    (global.get $counter.proto)
  )
  (elem $functions funcref
    (ref.func $counter.new)
    (ref.func $counter.get)
    (ref.func $counter.inc)
  )
  ;; \01  one protoconfig
  ;; \01    one constructorconfig
  ;; \07      length of name "Counter"
  ;; Counter    constructor name
  ;; \00      no static methods
  ;; \02    two methodconfigs
  ;; \00      method (not getter or setter)
  ;; \03        length of name "get"
  ;; get        method name
  ;; \00      method (not getter or setter)
  ;; \03        length of name "inc"
  ;; inc        method name
  ;; \7f    no parent prototype (-1 s32)
  (data $data "\01\01\07Counter\00\02\00\03get\00\03inc\7f")

  (global $counter.vtable (ref (exact $counter.vtable))
    (struct.new $counter.vtable
      (global.get $counter.proto)
      (ref.func $counter.get)
      (ref.func $counter.inc)
    )
  )

  (func $counter.get (type $get_t) (param (ref null $counter)) (result i32)
    (struct.get $counter $val (local.get 0))
  )

  (func $counter.inc (type $inc_t) (param (ref null $counter))
    (struct.set $counter $val
      (local.get 0)
      (i32.add
        (struct.get $counter $val (local.get 0))
        (i32.const 1)
      )
    )
  )

  (func $counter.new (type $new_t) (param i32) (result (ref $counter))
    (struct.new $counter
      (local.get 0)
      (global.get $counter.vtable)
    )
  )

  (func $start
    (call $configureAll
      (array.new_elem $prototypes $prototypes
        (i32.const 0)
        (i32.const 1)
      )
      (array.new_elem $functions $functions
        (i32.const 0)
        (i32.const 3)
      )
      (array.new_data $data $data
        (i32.const 0)
        (i32.const 23)
      )
      (global.get $constructors)
    )
  )

  (start $start)
)
```

Here is the corresponding JS file:

```js
// counter.mjs

let protoFactory = new Proxy({}, {
    get(target, prop, receiver) {
        // Always return a fresh, empty object.
        return {};
    }
});

let constructors = {};

let imports = {
    "protos": protoFactory,
    "env": { constructors },
};

let compileOptions = { builtins: ["js-prototypes"] };

let buffer = readbuffer("counter.wasm");

let { module, instance } =
    await WebAssembly.instantiate(buffer, imports, compileOptions);

let Counter = constructors.Counter;

let count = new Counter(0);

console.log(count.get());
count.inc();
console.log(count.get());

console.log(count instanceof Counter);
```

Note that the empty prototype object is created by a `Proxy`
that simply returns a fresh empty object whenever a property is accessed.
This is not necessary in this small example,
but it is the recommended way to import thousands
of empty prototype objects with minimal code size overhead.

Note as well that the arguments passed to `$configureAll`
are arrays allocated with `array.new_elem`.
It is of course not necessary to allocate the arrays this way,
but engines may recognize and optimize this pattern
to avoid allocating the arrays and copying the data.

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
  | 0x4D x:typeidx ct:comptype => (descriptor x) ct
  | ct:comptype => ct

describingcomptype ::=
  | 0x4C x:typeidx ct:describedcomptype => (describes x) ct
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

### Exact Function Imports

The `externtype` encoding is updated
with a new variant for exact function imports:

```
externtype = 0x00 x:typeidx => func x
             ...
             0x05 x:typeidx => func exact x
```

Note that we do not add support for exactly exported functions.
An export section using 0x05 is malfomed.

> We may add support for exact function exports in the future if there is
> some reason to do so.

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
