;; Validation

(module
  (rec
    (type $empty (descriptor $empty.desc) (struct))
    (type $one (descriptor $one.desc) (struct (field i32)))
    (type $pair (descriptor $pair.desc) (struct (field i32 i64)))
    (type $empty.desc (describes $empty) (struct))
    (type $one.desc (describes $one) (struct))
    (type $pair.desc (describes $pair) (struct))
  )

  (func (param (ref null (exact $empty.desc))) (result (ref (exact $empty)))
    (struct.new $empty (local.get 0))
  )
  (func (param (ref null (exact $empty.desc))) (result (ref (exact $empty)))
    (struct.new_default $empty (local.get 0))
  )
  (func (param (ref (exact $empty.desc))) (result (ref (exact $empty)))
    (struct.new $empty (local.get 0))
  )
  (func (param (ref (exact $empty.desc))) (result (ref (exact $empty)))
    (struct.new_default $empty (local.get 0))
  )
  (func (result (ref (exact $empty)))
    (struct.new $empty (ref.null none))
  )
  (func (result (ref (exact $empty)))
    (struct.new_default $empty (ref.null none))
  )
  (func (result (ref (exact $empty)))
    (struct.new $empty (unreachable))
  )
  (func (result (ref (exact $empty)))
    (struct.new_default $empty (unreachable))
  )

  (func (param (ref null (exact $one.desc))) (result (ref (exact $one)))
    (struct.new $one (i32.const 0) (local.get 0))
  )
  (func (param (ref null (exact $one.desc))) (result (ref (exact $one)))
    (struct.new_default $one (local.get 0))
  )
  (func (param (ref (exact $one.desc))) (result (ref (exact $one)))
    (struct.new $one (i32.const 0) (local.get 0))
  )
  (func (param (ref (exact $one.desc))) (result (ref (exact $one)))
    (struct.new_default $one (local.get 0))
  )
  (func (result (ref (exact $one)))
    (struct.new $one (i32.const 0) (ref.null none))
  )
  (func (result (ref (exact $one)))
    (struct.new_default $one (ref.null none))
  )
  (func (result (ref (exact $one)))
    (struct.new $one (i32.const 0) (unreachable))
  )
  (func (result (ref (exact $one)))
    (struct.new_default $one (unreachable))
  )

  (func (param (ref null (exact $pair.desc))) (result (ref (exact $pair)))
    (struct.new $pair (i32.const 1) (i64.const 2) (local.get 0))
  )
  (func (param (ref null (exact $pair.desc))) (result (ref (exact $pair)))
    (struct.new_default $pair (local.get 0))
  )
  (func (param (ref (exact $pair.desc))) (result (ref (exact $pair)))
    (struct.new $pair (i32.const 1) (i64.const 2) (local.get 0))
  )
  (func (param (ref (exact $pair.desc))) (result (ref (exact $pair)))
    (struct.new_default $pair (local.get 0))
  )
  (func (result (ref (exact $pair)))
    (struct.new $pair (i32.const 1) (i64.const 2) (ref.null none))
  )
  (func (result (ref (exact $pair)))
    (struct.new_default $pair (ref.null none))
  )
  (func (result (ref (exact $pair)))
    (struct.new $pair (i32.const 1) (i64.const 2) (unreachable))
  )
  (func (result (ref (exact $pair)))
    (struct.new_default $pair (unreachable))
  )
)

;; TODO: Remove 'definition' once we support execution.
(module definition
  (rec
    (type $a (descriptor $b) (struct))
    (type $b (describes $a) (descriptor $c) (struct))
    (type $c (describes $b) (descriptor $d) (struct))
    (type $d (describes $c) (struct))
  )

  (global $d (ref (exact $d)) (struct.new $d))
  (global $c (ref (exact $c)) (struct.new $c (global.get $d)))
  (global $b (ref (exact $b)) (struct.new $b (global.get $c)))
  (global $a (ref (exact $a)) (struct.new $a (global.get $b)))

  (func (result (ref (exact $a)))
    (struct.new $a
      (struct.new $b
        (struct.new $c
          (struct.new $d)
        )
      )
    )
  )
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct (field i32)))
      (type $b (describes $a) (struct))
    )
    ;; Missing descriptor.
    (func (result anyref)
      (struct.new $a (i32.const 0))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $struct (struct (field i32)))
      (type $a (descriptor $b) (struct (field i32)))
      (type $b (describes $a) (struct))
    )
    ;; Descriptor provided when allocating a type without a descriptor.
    (func (result anyref)
      (struct.new $struct (i32.const 0) (struct.new $b))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct (field i32)))
      (type $b (describes $a) (struct))
    )
    ;; Descriptor does not have expected type.
    (func (param (ref struct)) (result anyref)
      (struct.new $a (i32.const 0) (local.get 0))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct (field i32)))
      (type $b (describes $a) (struct))
    )
    ;; Descriptor must be exact.
    (func (param (ref $b)) (result anyref)
      (struct.new $a (i32.const 0) (local.get 0))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct (field i32)))
      (type $b (describes $a) (struct))
    )
    ;; Allocated type cannot be used as descriptor.
    (func (param (ref (exact $a))) (result anyref)
      (struct.new $a (i32.const 0) (local.get 0))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct (field i32)))
      (type $b (describes $a) (struct))
      (type $c (descriptor $d) (struct))
      (type $d (describes $c) (struct))
    )
    ;; Unrelated descriptor cannot be used as desciptor.
    (func (param (ref (exact $d))) (result anyref)
      (struct.new $a (i32.const 0) (local.get 0))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct (field i32))))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct (field i32))))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Subtype descriptor cannot be used as desciptor.
    (func (param (ref (exact $d))) (result anyref)
      (struct.new $a (i32.const 0) (local.get 0))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct (field i32))))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct (field i32))))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Supertype descriptor cannot be used as desciptor.
    (func (param (ref (exact $b))) (result anyref)
      (struct.new $c (i32.const 0) (local.get 0))
    )
  )
  "type mismatch"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct (field i32)))
      (type $b (describes $a) (struct))
    )
    ;; The correct descriptor is supplied, but the fields are missing.
    (func (result anyref)
      (struct.new $a (struct.new $b))
    )
  )
  "type mismatch"
)

;; TODO: execution (including in initializers)
