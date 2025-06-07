;; Test custom descriptors

(module
  (rec
    (type (descriptor 1 (struct)))
    (type (describes 0 (struct)))
  )
)

(module
  (rec
    (type $super (sub (descriptor $super-desc (struct))))
    (type $super-desc (sub (describes $super (struct))))
  )
  (rec
    (type $sub (sub $super (descriptor $sub-desc (struct))))
    (type $sub-desc (sub $super-desc (describes $sub (struct))))
  )
)

(module
  (type $super (sub (struct)))
  (rec
    (type $other (sub (descriptor $super-desc (struct))))
    (type $super-desc (sub (describes $other (struct))))
  )
  (rec
    (type $sub (sub $super (descriptor $sub-desc (struct))))
    (type $sub-desc (sub $super-desc (describes $sub (struct))))
  )
)
