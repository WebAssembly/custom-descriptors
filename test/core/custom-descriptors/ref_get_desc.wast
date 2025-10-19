;; Validation

(module
  (rec
    (type $a (descriptor $b) (struct))
    (type $b (describes $a) (struct))
  )

  (func (param (ref $a)) (result (ref $b))
    (ref.get_desc $a (local.get 0))
  )
  (func (param (ref null $a)) (result (ref $b))
    (ref.get_desc $a (local.get 0))
  )
  (func (param (ref (exact $a))) (result (ref (exact $b)))
    (ref.get_desc $a (local.get 0))
  )
  (func (param (ref null (exact $a))) (result (ref (exact $b)))
    (ref.get_desc $a (local.get 0))
  )

  (func (result (ref (exact $b)))
    (ref.get_desc $a (unreachable))
  )
  (func (result (ref (exact $b)))
    (ref.get_desc $a (ref.null none))
  )
  (func (result (ref (exact $b)))
    (ref.get_desc $a (ref.null (exact $a)))
  )
  (func (result (ref $b))
    (ref.get_desc $a (ref.null $a))
  )
)

;; Same, but now get a descriptor of a descriptor.
(module
  (rec
    (type $a (descriptor $b) (struct))
    (type $b (describes $a) (descriptor $c) (struct))
    (type $c (describes $b) (struct))
  )

  (func (param (ref $b)) (result (ref $c))
    (ref.get_desc $b (local.get 0))
  )
  (func (param (ref null $b)) (result (ref $c))
    (ref.get_desc $b (local.get 0))
  )
  (func (param (ref (exact $b))) (result (ref (exact $c)))
    (ref.get_desc $b (local.get 0))
  )
  (func (param (ref null (exact $b))) (result (ref (exact $c)))
    (ref.get_desc $b (local.get 0))
  )

  (func (result (ref (exact $c)))
    (ref.get_desc $b (unreachable))
  )
  (func (result (ref (exact $c)))
    (ref.get_desc $b (ref.null none))
  )
  (func (result (ref (exact $c)))
    (ref.get_desc $b (ref.null (exact $b)))
  )
  (func (result (ref $c))
    (ref.get_desc $b (ref.null $b))
  )
)

(assert_invalid
  (module
    ;; Type must exist.
    (func (result anyref)
      (ref.get_desc 1 (unreachable))
    )
  )
  "unknown type"
)

(assert_invalid
  (module
    ;; Cannot get the described type from a type that does not have one.
    (type $a (struct))
    (func (param (ref $a)) (result anyref)
      (ref.get_desc $a (local.get 0))
    )
  )
  "type without descriptor"
)

(assert_invalid
  (module
    ;; Same, but now the type is a function type.
    (type $a (func))
    (func (param (ref $a)) (result anyref)
      (ref.get_desc $a (local.get 0))
    )
  )
  "type without descriptor"
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
    )
    ;; Cannot get the described type from the descriptor.
    (func (param (ref $b)) (result (ref $a))
      (ref.get_desc $b (local.get 0))
    )
  )
  "type without descriptor"
)

(assert_invalid
  (module
    (rec
      (type $a (descriptor $b) (struct))
      (type $b (describes $a) (struct))
    )
    ;; Operand must have expected type.
    (func (param (ref any)) (result (ref $b))
      (ref.get_desc $a (local.get 0))
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
    ;; Only exact inputs produce exact outputs.
    (func (param (ref $a)) (result (ref (exact $b)))
      (ref.get_desc $a (local.get 0))
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
    ;; Only exact inputs produce exact outputs, even for nulls.
    (func (result (ref (exact $b)))
      (ref.get_desc $a (ref.null $a))
    )
  )
  "type mismatch"
)

(module
  (rec
    (type $a (sub (descriptor $b) (struct)))
    (type $b (sub (describes $a) (struct)))
    (type $c (sub $a (descriptor $d) (struct)))
    (type $d (sub $b (describes $c) (struct)))
  )
  ;; Subtyping works.
  (func (param (ref (exact $c))) (result (ref $b))
    (ref.get_desc $a (local.get 0))
  )
  (func (param (ref $c)) (result (ref $b))
    (ref.get_desc $a (local.get 0))
  )
)

(assert_invalid
  (module
    (rec
      (type $a (sub (descriptor $b) (struct)))
      (type $b (sub (describes $a) (struct)))
      (type $c (sub $a (descriptor $d) (struct)))
      (type $d (sub $b (describes $c) (struct)))
    )
    ;; Only exact inputs of the inspected type produce exact outputs.
    (func (param (ref (exact $c))) (result (ref (exact $b)))
      (ref.get_desc $a (local.get 0))
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
    ;; Same as above, but with a null.
    (func (result (ref (exact $b)))
      (ref.get_desc $a (ref.null (exact $c)))
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
    ;; The output describes the expected input, not the actual input.
    (func (param (ref (exact $c))) (result (ref $d))
      (ref.get_desc $a (local.get 0))
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
    ;; Same as above, but now the input is not exact.
    (func (param (ref $c)) (result (ref $d))
      (ref.get_desc $a (local.get 0))
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
    (global (ref $b) (ref.get_desc $a (ref.null none)))
  )
  "constant expression required"
)

;; Binary format

(module binary
  "\00asm" "\01\00\00\00"
  "\01" ;; Type section id
  "\12" ;; Type section length
  "\02" ;; Types vector length
  "\4e" ;; Recursion group
  "\02" ;; Rec group size
  "\4d" ;; Descriptor
  "\01" ;; Descriptor type index
  "\5f" ;; Struct
  "\00" ;; Number of fields
  "\4c" ;; Describes
  "\00" ;; Describes type index
  "\5f" ;; Struct
  "\00" ;; Number of fields
  "\60" ;; Func
  "\01" ;; Number of params
  "\63" ;; Ref null
  "\00" ;; Type index
  "\01" ;; Number of results
  "\64" ;; Ref
  "\01" ;; Type index
  "\03" ;; Function section id
  "\02" ;; Function section length
  "\01" ;; Functions vector length
  "\02" ;; Type index
  "\0a" ;; Code section id
  "\09" ;; Code section length
  "\01" ;; Code vector length
  "\07" ;; Code length
  "\00" ;; Number of locals
  "\20" ;; local.get
  "\00" ;; Local index
  "\fb\22" ;; ref.get_desc
  "\00" ;; Type index
  "\0b" ;; end
)

;; TODO: Execution
