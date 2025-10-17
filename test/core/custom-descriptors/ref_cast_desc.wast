;; Validation

(module
  (rec
    (type $a (sub (descriptor $b) (struct)))
    (type $b (sub (describes $a) (struct)))
    (type $c (sub $a (descriptor $d) (struct)))
    (type $d (sub $b (describes $c) (struct)))
  )

  ;; All nullness combinations
  (func (param (ref null any) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref null $b)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref $b)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null $b)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref $b)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )

  ;; All nullness combinations with subtype descriptors
  (func (param (ref null any) (ref null $d)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref null $d)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref $d)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref $d)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null $d)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null $d)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref $d)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref $d)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )

  ;; All nullness combinations with exact subtype descriptors
  (func (param (ref null any) (ref null (exact $d))) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref null (exact $d))) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref (exact $d))) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref (exact $d))) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null (exact $d))) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null (exact $d))) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref (exact $d))) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref (exact $d))) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
  )

  ;; All nullness combinations with exact casts
  (func (param (ref null any) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref null (exact $b))) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref (exact $b))) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref null (exact $b))) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )
  (func (param (ref any) (ref (exact $b))) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (local.get 1))
  )

  ;; Unreachable descriptor
  (func (param (ref null any)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (unreachable))
  )
  (func (param (ref null any)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (unreachable))
  )
  (func (param (ref any)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (unreachable))
  )
  (func (param (ref any)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (unreachable))
  )
  (func (param (ref null any)) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (unreachable))
  )
  (func (param (ref null any)) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (unreachable))
  )
  (func (param (ref any)) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (unreachable))
  )
  (func (param (ref any)) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (unreachable))
  )

  ;; Null descriptor
  (func (param (ref null any)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (ref.null none))
  )
  (func (param (ref null any)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (ref.null none))
  )
  (func (param (ref any)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (ref.null none))
  )
  (func (param (ref any)) (result (ref $a))
    (ref.cast_desc (ref $a) (local.get 0) (ref.null none))
  )
  (func (param (ref null any)) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (ref.null none))
  )
  (func (param (ref null any)) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (ref.null none))
  )
  (func (param (ref any)) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (ref.null none))
  )
  (func (param (ref any)) (result (ref (exact $a)))
    (ref.cast_desc (ref (exact $a)) (local.get 0) (ref.null none))
  )
)

(module
  (rec
    (type $a (sub (descriptor $b) (struct)))
    (type $b (sub (describes $a) (struct)))
    (type $c (sub $a (descriptor $d) (struct)))
    (type $d (sub $b (describes $c) (descriptor $e) (struct)))
    (type $e (describes $d) (struct))
  )

  ;; Cast to self
  (func (param (ref null $a) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null $a) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )

  ;; Cast to unrelated type
  (func (param (ref null i31) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null i31) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )

  ;; Cast from defined type to unrelated type
  (func (param (ref null $e) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null $e) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )

  ;; Cast from exact defined type to unrelated type
  (func (param (ref null (exact $e)) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null (exact $e)) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )

  ;; Cast to supertype
  (func (param (ref null $c) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null $c) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )

  ;; Cast from exact to supertype
  (func (param (ref null (exact $c)) (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (local.get 0) (local.get 1))
  )
  (func (param (ref null (exact $c)) (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (local.get 0) (local.get 1))
  )

  ;; Cast to subtype
  (func (param (ref null $a) (ref null $d)) (result (ref null $c))
    (ref.cast_desc (ref null $c) (local.get 0) (local.get 1))
  )
  (func (param (ref null $a) (ref null (exact $d))) (result (ref null (exact $c)))
    (ref.cast_desc (ref null (exact $c)) (local.get 0) (local.get 1))
  )

  ;; Cast from exact to subtype
  (func (param (ref null (exact $a)) (ref null $d)) (result (ref null $c))
    (ref.cast_desc (ref null $c) (local.get 0) (local.get 1))
  )
  (func (param (ref null (exact $a)) (ref null (exact $d))) (result (ref null (exact $c)))
    (ref.cast_desc (ref null (exact $c)) (local.get 0) (local.get 1))
  )

  ;; Cast from null
  (func (param (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (ref.null none) (local.get 0))
  )
  (func (param (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (ref.null none) (local.get 0))
  )

  ;; Cast from unreachable
  (func (param (ref null $b)) (result (ref null $a))
    (ref.cast_desc (ref null $a) (unreachable) (local.get 0))
  )
  (func (param (ref null (exact $b))) (result (ref null (exact $a)))
    (ref.cast_desc (ref null (exact $a)) (unreachable) (local.get 0))
  )

  ;; Cast to descriptor type
  (func (param (ref null any) (ref null $e)) (result (ref null $d))
    (ref.cast_desc (ref null $d) (local.get 0) (local.get 1))
  )
  (func (param (ref null any) (ref null (exact $e))) (result (ref null (exact $d)))
    (ref.cast_desc (ref null (exact $d)) (local.get 0) (local.get 1))
  )
)

(assert_invalid
  (module
    ;; Type must exist.
    (func (result anyref)
      (ref.cast_desc (ref 1) (unreachable))
    )
  )
  "unknown type"
)

(assert_invalid
  (module
    ;; Type must have a descriptor.
    (func (result anyref)
      (ref.cast_desc (ref any) (unreachable))
    )
  )
  "type any does not have a descriptor"
)

(assert_invalid
  (module
    ;; Type must have a descriptor.
    (func (result nullref)
      (ref.cast_desc (ref null none) (unreachable))
    )
  )
  "type none does not have a descriptor"
)

(assert_invalid
  (module
    (type $a (struct))
    ;; Type must have a descriptor.
    (func (result anyref)
      (ref.cast_desc (ref $a) (unreachable))
    )
  )
  "type 0 does not have a descriptor"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct))
      (type $b (describes $a) (struct))
    )
    ;; Cannot cast to descriptor without its own descriptor.
    (func (result anyref)
      (ref.cast_desc (ref $b) (unreachable))
    )
  )
  "type 1 does not have a descriptor"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct))
      (type $b (describes $a) (struct))
    )
    ;; Descriptor must have expected type.
    (func (param (ref null any) (ref null struct)) (result (ref null any))
      (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct))
      (type $b (describes $a) (struct))
    )
    ;; Descriptor must be exact when cast is exact.
    (func (param (ref null any) (ref $b)) (result (ref null any))
      (ref.cast_desc (ref (exact $a)) (local.get 0) (local.get 1))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct))
      (type $b (describes $a) (struct))
    )
    ;; Descriptor must be exact when cast is exact, even if the descriptor is null.
    (func (param (ref null any)) (result (ref null any))
      (ref.cast_desc (ref (exact $a)) (local.get 0) (ref.null $b))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct)))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; An exact reference to a subtype of the descriptor does not cut it.
    (func (param (ref null any) (ref (exact $d))) (result (ref null any))
      (ref.cast_desc (ref (exact $a)) (local.get 0) (local.get 1))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct))
      (type $b (describes $a) (struct))
    )
    ;; Cannot cast across hierarchies.
    (func (param (ref null func) (ref $b)) (result (ref null any))
      (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct)))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Ouput type is determined by immediate, not actual input.
    (func (param (ref $c) (ref $d)) (result (ref null $c))
      (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct)))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Same, but with an exact reference to the descriptor subtype.
    (func (param (ref $c) (ref (exact $d))) (result (ref null $c))
      (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct)))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Same, but with an exact reference to the expected descriptor type.
    (func (param (ref $c) (ref (exact $b))) (result (ref null $c))
      (ref.cast_desc (ref $a) (local.get 0) (local.get 1))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct)))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Same, but now the cast value and descriptor are both null.
    (func (result (ref null $c))
      (ref.cast_desc (ref $a) (ref.null none) (ref.null none))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct)))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Same, but now the cast value and descriptor are bottom.
    (func (result (ref null $c))
      (ref.cast_desc (ref $a) (unreachable))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct))
      (type $b (describes $a) (struct))
    )
    ;; Invalid in constant expression.
    (global (ref $a) (ref.cast_desc (ref null $a) (ref.null none) (ref.null none)))
  )
  "constant expression required"
)

;; TODO: Execution
